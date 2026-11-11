(() => {
  const PAGE_SIZE = 18;
  const $ = (selector) => document.querySelector(selector);
  const state = { resources: [], categories: [], category: "all", query: "", page: 1, sort: "default" };
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
  const fuzzyMatch = (haystack, query) => {
    if (!query) return true;
    const words = normalize(haystack).split(/\s+/);
    return normalize(query).split(/\s+/).every(q => words.some(w => w.includes(q) || (q.length > 3 && distance(w,q) <= (q.length > 6 ? 2 : 1))));
  };
  const categoryName = id => state.categories.find(c => c.id === id)?.name || "سایر";
  const filtered = () => {
    let list=state.resources.filter(item => (state.category==="all" || item.category===state.category) &&
      fuzzyMatch([item.title,item.description,item.url,...(item.tags||[])].join(" "),state.query));
    if(state.sort==="name") list.sort((a,b)=>a.title.localeCompare(b.title,"fa"));
    return list;
  };
  const renderCategories = () => {
    const root=$("#category-list");
    root.innerHTML=state.categories.map(c=>{
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
      return '<article class="resource-card"><div class="card-top"><div class="site-icon">'+safe(initial)+'</div><div style="min-width:0"><div class="card-title">'+safe(item.title)+'</div><div class="card-category">'+safe(categoryName(item.category))+'</div></div></div><p class="card-description">'+safe(item.description)+'</p><div class="card-bottom"><span class="card-domain">'+safe(domain)+'</span><a class="visit-link" href="'+safe(item.url)+'" target="_blank" rel="noopener noreferrer">بازدید از سایت ↗</a></div></article>';
    }).join("");
    $("#empty-state").hidden=visible.length!==0;$("#resource-grid").hidden=visible.length===0;
    $("#page-info").textContent=list.length?("نمایش "+(start+1).toLocaleString("fa-IR")+" تا "+Math.min(start+PAGE_SIZE,list.length).toLocaleString("fa-IR")+" از "+list.length.toLocaleString("fa-IR")):"۰ نتیجه";
    $("#page-numbers").innerHTML=Array.from({length:pages},(_,i)=>i+1).filter(n=>pages<=5||Math.abs(n-state.page)<=1||n===1||n===pages).map(n=>'<button class="page-number '+(n===state.page?"current":"")+'" data-page="'+n+'">'+n.toLocaleString("fa-IR")+'</button>').join("");
    document.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click",()=>{state.page=Number(b.dataset.page);render();}));
    $("#prev-page").disabled=state.page===1;$("#next-page").disabled=state.page===pages;
    $("#prev-page").onclick=()=>{if(state.page>1){state.page--;render()}};
    $("#next-page").onclick=()=>{if(state.page<pages){state.page++;render()}};
    $("#clear-search").hidden=!state.query;
  };
  let debounce;
  $("#search-input").addEventListener("input",e=>{clearTimeout(debounce);debounce=setTimeout(()=>{state.query=e.target.value.trim();state.page=1;render()},120)});
  $("#clear-search").addEventListener("click",()=>{$("#search-input").value="";state.query="";state.page=1;render();});
  $("#reset-search").addEventListener("click",()=>{state.category="all";state.query="";$("#search-input").value="";state.page=1;render();});
  $("#sort-select").addEventListener("change",e=>{state.sort=e.target.value;state.page=1;render();});
  $("#theme-toggle").addEventListener("click",()=>{const light=document.documentElement.classList.toggle("light");localStorage.setItem("library-theme",light?"light":"dark");});
  if(localStorage.getItem("library-theme")==="light")document.documentElement.classList.add("light");
  fetch("data/resources.json").then(r=>{if(!r.ok)throw new Error("Data unavailable");return r.json()}).then(data=>{
    state.resources=data.resources||[];state.categories=data.categories||[];render();
  }).catch(()=>{$("#total-count").textContent="بارگذاری منابع ناموفق بود";$("#resource-grid").innerHTML='<p class="card-description">فایل داده در دسترس نیست. لطفاً صفحه را دوباره بارگذاری کن.</p>';});
})();