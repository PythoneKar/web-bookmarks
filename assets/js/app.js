(() => {
  const PAGE_SIZE = 18;
  const FAVORITES_KEY = "web-bookmarks:favorites";
  const FAVORITES_VERSION = 1;
  const $ = (selector) => document.querySelector(selector);
  // Keep personal bookmarks separate from the site's frequently updated resource data.
  const loadFavorites = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "null");
      if (Array.isArray(saved)) return new Set(saved.filter(v => typeof v === "string"));
      if (saved && Array.isArray(saved.items)) return new Set(saved.items.filter(v => typeof v === "string"));
    } catch (error) { console.warn("Could not read saved bookmarks", error); }
    return new Set();
  };
  const favorites = loadFavorites();
  const saveFavorites = () => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify({ version: FAVORITES_VERSION, items: [...favorites] }));
      return true;
    } catch (error) { console.warn("Could not save bookmarks", error); return false; }
  };
  const state = { resources: [], categories: [], category: "all", query: "", page: 1, sort: "default", suggestions: [], activeSuggestion: -1 };
  const normalize = (value) => String(value ?? "").toLowerCase()
    .replace(/[يى]/g, "ی").replace(/ك/g, "ک")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ").trim();
  const distance = (a, b) => {
    if (Math.abs(a.length - b.length) > 2) return 99;
    let prev = Array.from({length:b.length + 1}, (_,i) => i);
    for (let i=1;i<=a.length;i++) {
      const row=[i];
      for(let j=1;j<=b.length;j++) row[j]=Math.min(row[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
      prev=row;
    }
    return prev[b.length];
  };
  // Offline bilingual vocabulary: Persian and English queries share the same search terms.
  const aliasGroups = [
    ["برنامه نویسی","programming","coding","کدنویسی","developer"],["توسعه","development","build","ساخت"],
    ["وب","web","website","سایت","وبسایت"],["طراحی","design","designer"],["گرافیک","graphic","graphics"],
    ["هوش","ai","artificial intelligence","intelligence"],["مصنوعی","artificial","ai"],
    ["یادگیری","learning","learn","study","آموزش"],["آموزش","tutorial","course","lesson","education"],
    ["فیلم","movie","movies","film","cinema"],["سریال","series","tv show"],["سرگرمی","entertainment"],
    ["خبر","news","headline","اخبار"],["خبرگزاری","news agency","press"],["رسانه","media","broadcast"],
    ["ماهواره","satellite"],["شبکه","channel","network"],["تلویزیون","television","tv"],
    ["زنده","live","stream","streaming","پخش زنده"],["پخش","broadcast","stream"],
    ["موسیقی","music","song","audio"],["عکس","photo","photography","image"],["تصویر","image","picture"],
    ["کتاب","book","books"],["دانشنامه","encyclopedia","wiki"],["امنیت","security","cybersecurity"],
    ["حریم","privacy"],["رمز","password"],["ابزار","tool","tools"],["رایگان","free"],
    ["دانلود","download"],["آپلود","upload"],["فضای ابری","cloud storage","cloud"],
    ["شبکه اجتماعی","social network","social media"],["پیام رسان","messaging","chat"],
    ["جستجو","search","find"],["موتور جستجو","search engine"],["ایمیل","email","mail"],
    ["بازی","game","gaming"],["ورزش","sport","sports"],["فوتبال","football","soccer"],
    ["اقتصاد","economy","business","finance"],["علم","science"],["فناوری","technology","tech"],
    ["پایتون","python"],["جاوااسکریپت","javascript","js"],["سی شارپ","c sharp","c#"],
    ["وردپرس","wordpress"],["فایرفاکس","firefox"],["گوگل","google"],["مایکروسافت","microsoft"],
    ["هوش مصنوعی مولد","generative ai"],["چت بات","chatbot","chat bot"],["ترجمه","translate","translation"],
    ["نقشه","map","maps"],["آب و هوا","weather"],["خرید","shopping","buy"]
  ];
  const aliasMap = new Map();
  for (const group of aliasGroups) {
    const normalized = group.map(normalize);
    for (const term of normalized) aliasMap.set(term, normalized);
  }
  const queryUnits = query => {
    const q = normalize(query);
    const units = [];
    const consumed = new Set();
    // Match known multi-word concepts first, so their component words don't over-constrain results.
    const phrases = aliasGroups.filter(g => g.some(v => normalize(v).includes(" "))).sort((a,b)=>Math.max(...b.map(x=>normalize(x).length))-Math.max(...a.map(x=>normalize(x).length)));
    for (const group of phrases) {
      const variants = group.map(normalize);
      const found = variants.find(v => v.includes(" ") && (" "+q+" ").includes(" "+v+" "));
      if (found) {
        found.split(" ").forEach(w=>consumed.add(w));
        units.push(variants);
      }
    }
    for (const word of q.split(/\s+/).filter(Boolean)) {
      if (consumed.has(word)) continue;
      units.push(aliasMap.get(word) || [word]);
    }
    return units;
  };
  const searchScore = (haystack, query, title = "") => {
    if (!query) return 1;
    const text = normalize(haystack), titleText = normalize(title);
    const words = text.split(/\s+/);
    const units = queryUnits(query);
    let matched = 0, score = 0;
    for (const variants of units) {
      let best = 0;
      for (const variant of variants) {
        const parts = variant.split(/\s+/).filter(Boolean);
        const exact = parts.every(part => text.includes(part));
        if (exact) best = Math.max(best, titleText.includes(variant) ? 5 : 3);
        else if (parts.length === 1 && variant.length > 3 && words.some(w=>distance(w,variant)<=1)) best=Math.max(best,1);
      }
      if (best) { matched++; score += best; }
    }
    const required = Math.max(1, Math.ceil(units.length * 0.65));
    return matched >= required ? score + (matched / units.length) * 4 : 0;
  };
  const fuzzyMatch = (haystack, query) => searchScore(haystack, query) > 0;
  const categoryName = id => id === "favorites" ? "نشان‌شده‌های من" : (state.categories.find(c => c.id === id)?.name || "سایر");
  const filtered = () => {
    let list=state.category==="favorites" ? state.resources.filter(item => favorites.has(item.url)) : state.resources.filter(item => state.category==="all" || item.category===state.category);
    if(state.query) list=list.map(item=>({item,score:searchScore([item.title,item.description,item.url,...(item.tags||[])].join(" "),state.query,item.title)}))
      .filter(x=>x.score>0).sort((a,b)=>b.score-a.score).map(x=>x.item);
    if(state.sort==="name") list.sort((a,b)=>a.title.localeCompare(b.title,"fa"));
    return list;
  };
  const renderCategories = () => {
    const root=$("#category-list");
    const favoriteCategory = '<button class="category '+(state.category==="favorites"?'active':'')+'" data-category="favorites"><span class="category-icon">★</span><span>نشان‌شده‌های من</span><b>'+favorites.size.toLocaleString("fa-IR")+'</b></button>';
    root.innerHTML=favoriteCategory+state.categories.map(c=>{
      const count=state.resources.filter(r=>r.category===c.id).length;
      return '<button class="category '+(state.category===c.id?'active':'')+'" data-category="'+c.id+'"><span class="category-icon">'+(c.icon||"◈")+'</span><span>'+c.name+'</span><b>'+count.toLocaleString("fa-IR")+'</b></button>';
    }).join("");
    $("#all-count").textContent=state.resources.length.toLocaleString("fa-IR");
    document.querySelectorAll(".category").forEach(button=>button.addEventListener("click",()=>{
      state.category=button.dataset.category;state.page=1;render();
    }));
  };
  const safe = value => String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const render = () => {
    renderCategories();
    const list=filtered(), pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));
    state.page=Math.min(state.page,pages);
    const start=(state.page-1)*PAGE_SIZE, visible=list.slice(start,start+PAGE_SIZE);
    $("#results-title").textContent=state.category==="all"?"همه منابع":categoryName(state.category);
    $("#results-subtitle").textContent=state.query?("نتایج جست‌وجو برای «"+state.query+"»"):"منابع منتخب، یک‌جا و مرتب";
    $("#total-count").textContent=state.resources.length.toLocaleString("fa-IR")+" منبع در "+state.categories.length.toLocaleString("fa-IR")+" دسته";
    $("#active-filters").innerHTML=state.query?'<span class="filter-chip">جست‌وجو: '+safe(state.query)+'</span>':"";
    $("#resource-grid").innerHTML=visible.map(item=>{
      const domain=(()=>{try{return new URL(item.url).hostname.replace(/^www\./,"")}catch{return item.url}})();
      const initial=(item.title||"؟").trim().charAt(0);
      const favicon="https://www.google.com/s2/favicons?domain_url="+encodeURIComponent(item.url)+"&sz=128";
      const isFavorite=favorites.has(item.url);
      return '<article class="resource-card"><div class="card-top"><div class="site-icon"><img src="'+favicon+'" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="site-icon-fallback" hidden>'+safe(initial)+'</span></div><div class="card-heading"><div class="card-title">'+safe(item.title)+'</div><div class="card-category">'+safe(categoryName(item.category))+'</div></div><button class="favorite-button '+(isFavorite?'is-favorite':'')+'" type="button" data-favorite="'+safe(item.url)+'" aria-label="'+(isFavorite?'حذف از نشان‌شده‌ها':'افزودن به نشان‌شده‌ها')+'" aria-pressed="'+isFavorite+'">'+(isFavorite?'★':'☆')+'</button></div><p class="card-description">'+safe(item.description)+'</p><div class="card-bottom"><span class="card-domain">'+safe(domain)+'</span><a class="visit-link" href="'+safe(item.url)+'" target="_blank" rel="noopener noreferrer">بازدید از سایت ↗</a></div></article>';
    }).join("");
    $("#empty-state").hidden=visible.length!==0;$("#resource-grid").hidden=visible.length===0;
    $("#page-info").textContent=list.length?("نمایش "+(start+1).toLocaleString("fa-IR")+" تا "+Math.min(start+PAGE_SIZE,list.length).toLocaleString("fa-IR")+" از "+list.length.toLocaleString("fa-IR")):"۰ نتیجه";
    $("#page-numbers").innerHTML=Array.from({length:pages},(_,i)=>i+1).filter(n=>pages<=5||Math.abs(n-state.page)<=1||n===1||n===pages).map(n=>'<button class="page-number '+(n===state.page?"current":"")+'" data-page="'+n+'">'+n.toLocaleString("fa-IR")+'</button>').join("");
    document.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click",()=>{state.page=Number(b.dataset.page);render();}));
    document.querySelectorAll("[data-favorite]").forEach(button=>button.addEventListener("click",()=>{
      const url=button.dataset.favorite;
      if(favorites.has(url)) favorites.delete(url); else favorites.add(url);
      saveFavorites();
      render();
    }));
    $("#prev-page").disabled=state.page===1;$("#next-page").disabled=state.page===pages;
    $("#prev-page").onclick=()=>{if(state.page>1){state.page--;render()}};
    $("#next-page").onclick=()=>{if(state.page<pages){state.page++;render()}};
    $("#clear-search").hidden=!state.query;
  };
  const suggestionBox=$("#search-suggestions"), searchInput=$("#search-input");
  const closeSuggestions=()=>{suggestionBox.hidden=true;searchInput.setAttribute("aria-expanded","false");state.activeSuggestion=-1;};
  const updateSuggestions=()=>{
    const q=searchInput.value.trim();
    if(!q||!state.resources.length){closeSuggestions();return;}
    const matches=state.resources.map(item=>({item,score:searchScore([item.title,item.description,item.url,...(item.tags||[])].join(" "),q,item.title)}))
      .filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,7).map(x=>x.item);
    state.suggestions=matches;
    if(!matches.length){suggestionBox.innerHTML='<div class="suggestion-hint">پیشنهادی پیدا نشد؛ برای دیدن نتایج کامل Enter بزن.</div>';suggestionBox.hidden=false;searchInput.setAttribute("aria-expanded","true");return;}
    suggestionBox.innerHTML=matches.map((item,i)=>'<button type="button" class="suggestion-item" role="option" aria-selected="'+(i===state.activeSuggestion)+'" data-suggestion="'+i+'"><span class="suggestion-initial">'+safe((item.title||"؟").trim().charAt(0))+'</span><span class="suggestion-copy"><strong>'+safe(item.title)+'</strong><small>'+safe(categoryName(item.category))+' · '+safe(item.url)+'</small></span></button>').join("")+'<div class="suggestion-hint">برای انتخاب پیشنهاد از کلیدهای جهت‌نما یا کلیک استفاده کن</div>';
    suggestionBox.hidden=false;searchInput.setAttribute("aria-expanded","true");
  };
  searchInput.addEventListener("input",()=>{state.query=searchInput.value.trim();state.page=1;state.activeSuggestion=-1;render();updateSuggestions();});
  searchInput.addEventListener("keydown",e=>{
    if(e.key==="Escape"){closeSuggestions();return;}
    if(e.key==="ArrowDown"&&state.suggestions.length){e.preventDefault();state.activeSuggestion=Math.min(state.activeSuggestion+1,state.suggestions.length-1);updateSuggestions();return;}
    if(e.key==="ArrowUp"&&state.suggestions.length){e.preventDefault();state.activeSuggestion=Math.max(state.activeSuggestion-1,0);updateSuggestions();return;}
    if(e.key==="Enter"&&state.activeSuggestion>=0&&state.suggestions[state.activeSuggestion]){e.preventDefault();searchInput.value=state.suggestions[state.activeSuggestion].title;state.query=searchInput.value;state.page=1;closeSuggestions();render();}
  });
  suggestionBox.addEventListener("click",e=>{
    const button=e.target.closest("[data-suggestion]");if(!button)return;
    const item=state.suggestions[Number(button.dataset.suggestion)];if(!item)return;
    searchInput.value=item.title;state.query=item.title;state.page=1;closeSuggestions();render();
  });
  document.addEventListener("click",e=>{if(!e.target.closest(".search-wrap")&&!e.target.closest("#search-suggestions"))closeSuggestions();});
  $("#clear-search").addEventListener("click",()=>{$("#search-input").value="";state.query="";state.page=1;closeSuggestions();render();});
  $("#reset-search").addEventListener("click",()=>{state.category="all";state.query="";$("#search-input").value="";state.page=1;closeSuggestions();render();});
  $("#sort-select").addEventListener("change",e=>{state.sort=e.target.value;state.page=1;render();});
  $("#theme-toggle").addEventListener("click",()=>{const light=document.documentElement.classList.toggle("light");localStorage.setItem("library-theme",light?"light":"dark");});
  if(localStorage.getItem("library-theme")==="light")document.documentElement.classList.add("light");
  fetch("data/resources.json").then(r=>{if(!r.ok)throw new Error("Data unavailable");return r.json()}).then(data=>{
    state.resources=data.resources||[];state.categories=data.categories||[];render();
  }).catch(()=>{$("#total-count").textContent="بارگذاری منابع ناموفق بود";$("#resource-grid").innerHTML='<p class="card-description">فایل داده در دسترس نیست. لطفاً صفحه را دوباره بارگذاری کن.</p>';});
})();