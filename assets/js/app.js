(() => {
  const PAGE_SIZE = 18;
  const FAVORITES_KEY = "web-bookmarks:favorites";
  const FAVORITES_VERSION = 1;
  const BOOKMARKS_KEY = "web-bookmarks:pinned";
  const FOLDERS_KEY = "web-bookmarks:folders";
  const FOLDER_ITEMS_KEY = "web-bookmarks:folder-items";
  const ASSET_VERSION = "20261111-24";
  const loadStored = (key,fallback) => { try { return JSON.parse(localStorage.getItem(key)||"null") ?? fallback; } catch { return fallback; } };
  let folderCreateOpen = false;
  let folderEditMode = false;
  let editingFolderId = null;
  let pendingDeleteFolderId = null;
  let draggedFolderId = null;
  let folders = loadStored(FOLDERS_KEY,[]);
  if(!Array.isArray(folders)) folders=[];
  folders=folders.filter(f=>f&&typeof f.id==="string"&&typeof f.name==="string").slice(0,10);
  let folderItems=loadStored(FOLDER_ITEMS_KEY,{});
  if(!folderItems||typeof folderItems!=="object"||Array.isArray(folderItems))folderItems={};
  const saveFolders=()=>{try{localStorage.setItem(FOLDERS_KEY,JSON.stringify(folders));}catch(e){console.warn("Could not save folders",e);}};
  const saveFolderItems=()=>{try{localStorage.setItem(FOLDER_ITEMS_KEY,JSON.stringify(folderItems));}catch(e){console.warn("Could not save folder assignments",e);}};
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
  // Pinned bookmarks are separate from starred favorites and survive catalogue updates.
  const loadBookmarks = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || "[]");
      return Array.isArray(saved) ? [...new Set(saved.filter(v => typeof v === "string"))] : [];
    } catch (error) { console.warn("Could not read pinned bookmarks", error); return []; }
  };
  let bookmarks = loadBookmarks();
  const saveBookmarks = () => {
    try { localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks)); return true; }
    catch (error) { console.warn("Could not save pinned bookmarks", error); return false; }
  };
  let animateCardsOnNextRender = false;
  const saveFavorites = () => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify({ version: FAVORITES_VERSION, items: [...favorites] }));
      return true;
    } catch (error) { console.warn("Could not save bookmarks", error); return false; }
  };
  const state = { resources: [], categories: [], category: "all", subcategory: null, query: "", page: 1, sort: "default", folderId: null, suggestions: [], activeSuggestion: -1 };
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
  const subcategoryName = id => state.categories.flatMap(c => c.subcategoryGroups || []).flatMap(g => g.items).find(x => x.id === id)?.name || "";
  const filtered = () => {
    let list=state.folderId ? state.resources.filter(item=>folderItems[item.url]===state.folderId) : (state.category==="favorites" ? state.resources.filter(item => favorites.has(item.url)) : state.resources.filter(item => state.category==="all" || item.category===state.category));
    if(state.subcategory&&!state.folderId) list=list.filter(item=>item.subcategory===state.subcategory);
    if(state.query) list=list.map(item=>({item,score:searchScore([item.title,item.description,item.url,item.subcategory||"",subcategoryName(item.subcategory),...(item.tags||[])].join(" "),state.query,item.title)}))
      .filter(x=>x.score>0).sort((a,b)=>b.score-a.score).map(x=>x.item);
    list.sort((a,b) => {
      const ai = bookmarks.indexOf(a.url), bi = bookmarks.indexOf(b.url);
      if (ai !== -1 || bi !== -1) {
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      }
      return state.sort === "name" ? a.title.localeCompare(b.title,"fa") : 0;
    });
    return list;
  };
  const renderCategories = () => {
    const root=$("#category-list");
    const favoriteCategory = '<button class="category '+(state.category==="favorites"?'active':'')+'" data-category="favorites"><span class="category-icon">★</span><span>نشان‌شده‌های من</span><b>'+favorites.size.toLocaleString("fa-IR")+'</b></button>';
    root.innerHTML=favoriteCategory+state.categories.map((c,index)=>{
      const count=state.resources.filter(r=>r.category===c.id).length;
      if(!c.subcategoryGroups || !c.subcategoryGroups.length) return '<button class="category '+(state.category===c.id?'active':'')+'" data-category="'+c.id+'"><span class="category-icon">'+(c.icon||"◈")+'</span><span class="category-number">'+(index+1).toLocaleString("fa-IR")+'</span><span>'+safe(c.name)+'</span><b>'+count.toLocaleString("fa-IR")+'</b></button>';
      const groups=c.subcategoryGroups.map(group=>'<section class="mega-group"><h4>'+safe(group.title)+'</h4>'+group.items.map(item=>{
        const tools=state.resources.filter(r=>r.category===c.id&&r.subcategory===item.id);
        const toolLinks=tools.map(tool=>{
          const favicon="https://www.google.com/s2/favicons?domain_url="+encodeURIComponent(tool.url)+"&sz=64";
          const pinned=bookmarks.includes(tool.url), starred=favorites.has(tool.url);
          return '<div class="mega-tool-row"><a class="mega-tool" href="'+safe(tool.url)+'" target="_blank" rel="noopener noreferrer"><img src="'+favicon+'" alt="" loading="lazy" referrerpolicy="no-referrer"><span>'+safe(tool.title)+'</span></a></div>';
        }).join("");
        return '<div class="mega-link-wrap"><button type="button" class="mega-link '+(state.subcategory===item.id?'active':'')+'" data-subcategory="'+item.id+'" aria-haspopup="true"><span>'+safe(item.name)+'</span><b>'+tools.length.toLocaleString("fa-IR")+'</b><span class="mega-link-arrow" aria-hidden="true">‹</span></button><div class="mega-submenu" role="region" aria-label="ابزارهای '+safe(item.name)+'"><div class="mega-submenu-head">'+safe(item.name)+' <small>'+tools.length.toLocaleString("fa-IR")+' ابزار</small></div><div class="mega-tool-list">'+(toolLinks||'<span class="mega-tools-empty">هنوز ابزاری ثبت نشده</span>')+'</div></div></div>';
      }).join("")+'</section>').join("");
      return '<div class="category-with-menu"><button class="category '+(state.category===c.id?'active':'')+'" data-category="'+c.id+'" aria-haspopup="true" aria-expanded="false"><span class="category-icon">'+(c.icon||"◈")+'</span><span>'+safe(c.name)+'</span><b>'+count.toLocaleString("fa-IR")+'</b><span class="category-menu-cue" aria-hidden="true">☷</span></button><svg class="mega-bridge" aria-hidden="true" focusable="false"><path class="mega-bridge-path" id="mega-bridge-'+safe(c.id)+'" d="" /><text class="mega-bridge-label"><textPath href="#mega-bridge-'+safe(c.id)+'" startOffset="50%" text-anchor="middle">بیاین یکم بازی کنیم؛ مسیر رو دنبال کنید</textPath></text></svg><div class="mega-menu" role="region" aria-label="زیرشاخه‌های '+safe(c.name)+'"><div class="mega-menu-head"><div><strong>'+safe(c.name)+'</strong><small>همه منابع این دسته، مرتب‌شده بر اساس موضوع</small></div><button type="button" class="mega-all" data-subcategory="">همه ابزارها و منابع</button></div><div class="mega-menu-grid">'+groups+'</div></div></div>';
    }).join("");
    $("#all-count").textContent=state.resources.length.toLocaleString("fa-IR");
    const positionMegaBridge=wrapper=>{
      const trigger=wrapper.querySelector(".category"),menu=wrapper.querySelector(".mega-menu"),path=wrapper.querySelector(".mega-bridge-path");
      if(!trigger||!menu||!path||!wrapper.classList.contains("open"))return;
      const a=trigger.getBoundingClientRect(),b=menu.getBoundingClientRect();
      const x1=a.left+2,y1=a.top+a.height/2,x2=b.right-2,y2=b.top+b.height/2;
      const bend=Math.max(24,Math.abs(x1-x2)*.42);
      path.setAttribute("d","M "+x1+" "+y1+" C "+(x1-bend)+" "+y1+", "+(x2+bend)+" "+y2+", "+x2+" "+y2);
    };
    document.querySelectorAll(".category").forEach(button=>button.addEventListener("click",()=>{
      state.category=button.dataset.category;state.folderId=null;state.subcategory=null;state.page=1;render();
      const wrapper=[...document.querySelectorAll(".category-with-menu")].find(x=>x.querySelector(".category").dataset.category===button.dataset.category);
      if(wrapper){wrapper.classList.add("open");wrapper.querySelector(".category").setAttribute("aria-expanded","true");requestAnimationFrame(()=>positionMegaBridge(wrapper));}
    }));
    const mega=document.querySelectorAll(".category-with-menu");
    mega.forEach(wrapper=>{
      const trigger=wrapper.querySelector(".category");
      wrapper.addEventListener("mouseenter",()=>{wrapper.classList.add("open");trigger.setAttribute("aria-expanded","true");requestAnimationFrame(()=>positionMegaBridge(wrapper));});
      wrapper.addEventListener("mouseleave",e=>{
        if(e.relatedTarget&&wrapper.contains(e.relatedTarget))return;
        wrapper.classList.remove("open");trigger.setAttribute("aria-expanded","false");
      });
      wrapper.addEventListener("focusin",()=>{wrapper.classList.add("open");trigger.setAttribute("aria-expanded","true");requestAnimationFrame(()=>positionMegaBridge(wrapper));});
      wrapper.addEventListener("focusout",e=>{if(!wrapper.contains(e.relatedTarget)){wrapper.classList.remove("open");trigger.setAttribute("aria-expanded","false");}});
    });
    window.addEventListener("resize",()=>document.querySelectorAll(".category-with-menu.open").forEach(positionMegaBridge));
    // When a nested tool list opens near the bottom, gently scroll only its own mega menu
    // far enough to reveal the complete list without moving the whole page.
    root.querySelectorAll(".mega-link-wrap").forEach(item=>{
      item.addEventListener("mouseenter",()=>{
        const menu=item.closest(".mega-menu");
        const submenu=item.querySelector(".mega-submenu");
        if(!menu||!submenu) return;
        requestAnimationFrame(()=>{
          const menuRect=menu.getBoundingClientRect();
          const subRect=submenu.getBoundingClientRect();
          const visibleBottom=menuRect.bottom-menu.clientTop;
          const overflow=subRect.bottom-visibleBottom;
          if(overflow>6){
            const maxScroll=menu.scrollHeight-menu.clientHeight;
            const target=Math.min(maxScroll,menu.scrollTop+overflow+14);
            menu.scrollTo({top:target,behavior:"smooth"});
          }
        });
      });
    });
    root.querySelectorAll("[data-subcategory]").forEach(button=>button.addEventListener("click",()=>{
      const wrapper=button.closest(".category-with-menu");
      state.category=wrapper.querySelector(".category").dataset.category;
      state.subcategory=button.dataset.subcategory||null;state.page=1;render();
    }));
    const syncMegaAction=(url)=>{
      const pinned=bookmarks.includes(url), starred=favorites.has(url);
      root.querySelectorAll("[data-mega-bookmark]").forEach(b=>{if(b.dataset.megaBookmark===url){b.classList.toggle("is-bookmarked",pinned);b.setAttribute("aria-pressed",String(pinned));b.setAttribute("aria-label",pinned?"برداشتن بوکمارک":"بوکمارک کردن ابزار");b.title=pinned?"برداشتن بوکمارک":"بوکمارک کردن";}});
      root.querySelectorAll("[data-mega-favorite]").forEach(b=>{if(b.dataset.megaFavorite===url){b.classList.toggle("is-favorite",starred);b.setAttribute("aria-pressed",String(starred));b.setAttribute("aria-label",starred?"حذف از نشان‌شده‌ها":"افزودن به نشان‌شده‌ها");b.title=starred?"حذف ستاره":"ستاره‌دار کردن";b.textContent=starred?"★":"☆";}});
      document.querySelectorAll(".resource-card[data-resource-url]").forEach(card=>{if(card.dataset.resourceUrl===url){card.classList.toggle("is-bookmarked",pinned);const b=card.querySelector("[data-bookmark]");if(b){b.classList.toggle("is-bookmarked",pinned);b.setAttribute("aria-pressed",String(pinned));b.setAttribute("aria-label",pinned?"برداشتن بوکمارک":"بوکمارک و انتقال به ابتدای دسته");}const f=card.querySelector("[data-favorite]");if(f){f.classList.toggle("is-favorite",starred);f.setAttribute("aria-pressed",String(starred));f.setAttribute("aria-label",starred?"حذف از نشان‌شده‌ها":"افزودن به نشان‌شده‌ها");f.textContent=starred?"★":"☆";}}});
      const favCount=document.querySelector('[data-category="favorites"] b');if(favCount)favCount.textContent=favorites.size.toLocaleString("fa-IR");
    };
    root.querySelectorAll("[data-mega-bookmark]").forEach(button=>button.addEventListener("click",e=>{
      e.preventDefault();e.stopPropagation();const url=button.dataset.megaBookmark,index=bookmarks.indexOf(url);
      if(index!==-1)bookmarks.splice(index,1);else bookmarks.unshift(url);
      saveBookmarks();syncMegaAction(url);
    }));
    root.querySelectorAll("[data-mega-favorite]").forEach(button=>button.addEventListener("click",e=>{
      e.preventDefault();e.stopPropagation();const url=button.dataset.megaFavorite;
      if(favorites.has(url))favorites.delete(url);else favorites.add(url);
      saveFavorites();syncMegaAction(url);
    }));
  };
  const safe = value => String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  const renderFolderBar=()=>{
    const bar=$("#folder-toolbar");if(!bar)return;
    const createControl=folderCreateOpen
      ? '<form class="folder-create-form" id="folder-create-form"><input id="folder-name-input" name="folderName" type="text" maxlength="40" autocomplete="off" placeholder="نام پوشه..." aria-label="نام پوشه جدید" required><button type="submit" class="folder-save-button">ذخیره</button><button type="button" class="folder-cancel-button" data-cancel-folder>انصراف</button></form>'
      : '<button type="button" class="folder-add-button" id="add-folder-button" '+(folders.length>=10?'disabled':'')+'>＋ افزودن پوشه جدید</button>';
    const folderMarkup=folders.map(f=>{
      if(editingFolderId===f.id)return '<form class="folder-edit-form" data-folder-edit-form="'+safe(f.id)+'"><input name="folderName" maxlength="40" value="'+safe(f.name)+'" aria-label="نام جدید پوشه" required><button type="submit" class="folder-save-button">ذخیره</button><button type="button" class="folder-cancel-button" data-cancel-folder-edit>انصراف</button></form>';
      return '<div class="folder-chip-wrap '+(folderEditMode?'folder-editing':'')+'" '+(folderEditMode?'draggable="true" data-folder-drag="'+safe(f.id)+'"':'')+'>'+
        '<button type="button" class="folder-chip '+(state.folderId===f.id?'active':'')+'" data-folder-filter="'+safe(f.id)+'">📁 '+safe(f.name)+' <span>'+state.resources.filter(r=>folderItems[r.url]===f.id).length.toLocaleString("fa-IR")+'</span></button>'+
        (folderEditMode?'<button type="button" class="folder-manage-button" data-edit-folder="'+safe(f.id)+'" aria-label="ویرایش پوشه '+safe(f.name)+'" title="ویرایش">✎</button><button type="button" class="folder-manage-button folder-delete-button" data-delete-folder="'+safe(f.id)+'" aria-label="حذف پوشه '+safe(f.name)+'" title="حذف">×</button>':'')+'</div>';
    }).join('');
    bar.innerHTML=createControl+
      '<button type="button" class="folder-chip '+(!state.folderId?'active':'')+'" data-folder-filter="">همه منابع</button>'+
      folderMarkup+
      '<button type="button" class="folder-edit-toggle '+(folderEditMode?'active':'')+'" data-toggle-folder-edit>'+ (folderEditMode?'پایان ویرایش':'✎ ویرایش پوشه‌ها')+'</button>'+
      '<span class="folder-limit">'+folders.length.toLocaleString("fa-IR")+' از ۱۰ پوشه</span>';
    if(folderCreateOpen) requestAnimationFrame(()=>$("#folder-name-input")?.focus());
    if(editingFolderId) requestAnimationFrame(()=>bar.querySelector('[data-folder-edit-form] input')?.focus());
  };
  const showFolderDeleteConfirm=id=>{
    const folder=folders.find(f=>f.id===id);if(!folder)return;
    pendingDeleteFolderId=id;
    document.querySelector("#folder-delete-confirm")?.remove();
    const dialog=document.createElement("div");dialog.id="folder-delete-confirm";dialog.className="folder-confirm-backdrop";
    dialog.innerHTML='<div class="folder-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="folder-delete-title"><div class="folder-confirm-icon">!</div><strong id="folder-delete-title">حذف پوشه</strong><p>مطمئنی می‌خوای پوشه «'+safe(folder.name)+'» رو حذف کنی؟ ابزارهای داخل پوشه حذف نمی‌شن و فقط از این پوشه خارج می‌شن.</p><div class="folder-confirm-actions"><button type="button" class="folder-confirm-no" data-folder-delete-no>نه</button><button type="button" class="folder-confirm-yes" data-folder-delete-yes>آره، حذفش کن</button></div></div>';
    document.body.appendChild(dialog);
  };
  const closeFolderDeleteConfirm=()=>{pendingDeleteFolderId=null;document.querySelector("#folder-delete-confirm")?.remove();};

  const showFolderMenu=(url,x,y,itemType="ابزارک")=>{
    document.querySelector("#folder-context-menu")?.remove();
    const menu=document.createElement("div");menu.id="folder-context-menu";menu.className="folder-context-menu";menu.dataset.url=url;
    menu.style.left=Math.max(8,Math.min(x,window.innerWidth-250))+"px";
    menu.style.top=Math.max(8,Math.min(y,window.innerHeight-300))+"px";
    const pinned=bookmarks.includes(url),starred=favorites.has(url);
    menu.innerHTML='<strong>مدیریت '+safe(itemType)+'</strong>'+
      '<button type="button" class="context-action" data-context-bookmark>'+(pinned?'✓ حذف بوکمارک':'▣ افزودن به بوکمارک‌ها')+'</button>'+
      '<button type="button" class="context-action" data-context-favorite>'+(starred?'★ حذف از نشان‌شده‌ها':'☆ افزودن به نشان‌شده‌ها')+'</button>'+
      '<div class="context-menu-divider"></div><strong>انتقال به پوشه</strong>'+
      (folders.length?folders.map(f=>'<button type="button" data-assign-folder="'+safe(f.id)+'">'+(folderItems[url]===f.id?'✓ ':'📁 ')+safe(f.name)+'</button>').join(''):'<p>هنوز پوشه‌ای نساخته‌ای.</p>')+
      (folderItems[url]?'<button type="button" class="folder-remove-item" data-remove-folder-item>× حذف از پوشه فعلی</button>':'')+
      (folders.length<10?'<div class="context-menu-divider"></div><button type="button" class="context-action" data-context-new-folder>＋ ساخت پوشه جدید و افزودن این مورد</button>':'')+
      '<button type="button" class="folder-context-close" data-close-folder-menu>بستن</button>';
    document.body.appendChild(menu);
    requestAnimationFrame(()=>{const rect=menu.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(x,window.innerWidth-rect.width-8))+"px";menu.style.top=Math.max(8,Math.min(y,window.innerHeight-rect.height-8))+"px";});
  };
  const closeFolderMenu=()=>document.querySelector("#folder-context-menu")?.remove();
  const render = () => {
    const previousRects = animateCardsOnNextRender ? new Map([...document.querySelectorAll(".resource-card[data-resource-url]")].map(card => [card.dataset.resourceUrl, card.getBoundingClientRect()])) : null;
    animateCardsOnNextRender = false;
    renderCategories();
    renderFolderBar();
    const list=filtered(), pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));
    state.page=Math.min(state.page,pages);
    const start=(state.page-1)*PAGE_SIZE, visible=list.slice(start,start+PAGE_SIZE);
    $("#results-title").textContent=state.folderId?(folders.find(f=>f.id===state.folderId)?.name||"پوشه"):(state.subcategory?subcategoryName(state.subcategory):(state.category==="all"?"همه منابع":categoryName(state.category)));
    $("#results-subtitle").textContent=state.folderId?"ابزارهای ذخیره‌شده در این پوشه":state.query?("نتایج جست‌وجو برای «"+state.query+"»"):(state.subcategory?"ابزارها و منابع منتخب این شاخه":"منابع منتخب، یک‌جا و مرتب");
    $("#total-count").textContent=state.resources.length.toLocaleString("fa-IR")+" منبع در "+state.categories.length.toLocaleString("fa-IR")+" دسته";
    $("#active-filters").innerHTML=state.query?'<span class="filter-chip">جست‌وجو: '+safe(state.query)+'</span>':"";
    $("#resource-grid").innerHTML=visible.map(item=>{
      const domain=(()=>{try{return new URL(item.url).hostname.replace(/^www\./,"")}catch{return item.url}})();
      const initial=(item.title||"؟").trim().charAt(0);
      const favicon="https://www.google.com/s2/favicons?domain_url="+encodeURIComponent(item.url)+"&sz=128";
      const isFavorite=favorites.has(item.url);
      const isBookmarked=bookmarks.includes(item.url);
      return '<article class="resource-card '+(isBookmarked?'is-bookmarked':'')+'" data-resource-url="'+safe(item.url)+'"><div class="card-top"><div class="site-icon"><img src="'+favicon+'" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="site-icon-fallback" hidden>'+safe(initial)+'</span></div><div class="card-heading"><div class="card-title">'+safe(item.title)+'</div><div class="card-category">'+safe(categoryName(item.category))+'</div></div><div class="card-actions"><button type="button" class="card-action-button card-bookmark-button '+(isBookmarked?'is-bookmarked':'')+'" data-bookmark="'+safe(item.url)+'" aria-label="'+(isBookmarked?'برداشتن بوکمارک':'افزودن به بوکمارک‌ها')+'" aria-pressed="'+String(isBookmarked)+'" title="'+(isBookmarked?'حذف بوکمارک':'بوکمارک کردن')+'">▣</button><button type="button" class="card-action-button card-favorite-button '+(isFavorite?'is-favorite':'')+'" data-favorite="'+safe(item.url)+'" aria-label="'+(isFavorite?'حذف از نشان‌شده‌ها':'افزودن به نشان‌شده‌ها')+'" aria-pressed="'+String(isFavorite)+'" title="'+(isFavorite?'حذف ستاره':'ستاره‌دار کردن')+'">'+(isFavorite?'★':'☆')+'</button></div></div><p class="card-description">'+safe(item.description)+'</p><div class="card-bottom"><span class="card-domain">'+safe(domain)+'</span><a class="visit-link" href="'+safe(item.url)+'" target="_blank" rel="noopener noreferrer">بازدید از سایت ↗</a></div></article>';
    }).join("");
    $("#empty-state").hidden=visible.length!==0;$("#resource-grid").hidden=visible.length===0;
    $("#page-info").textContent=list.length?("نمایش "+(start+1).toLocaleString("fa-IR")+" تا "+Math.min(start+PAGE_SIZE,list.length).toLocaleString("fa-IR")+" از "+list.length.toLocaleString("fa-IR")):"۰ نتیجه";
    $("#page-numbers").innerHTML=Array.from({length:pages},(_,i)=>i+1).filter(n=>pages<=5||Math.abs(n-state.page)<=1||n===1||n===pages).map(n=>'<button class="page-number '+(n===state.page?"current":"")+'" data-page="'+n+'">'+n.toLocaleString("fa-IR")+'</button>').join("");
    document.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click",()=>{state.page=Number(b.dataset.page);render();}));
    if (previousRects) document.querySelectorAll(".resource-card[data-resource-url]").forEach(card => {
      const before = previousRects.get(card.dataset.resourceUrl);
      if (!before) return;
      const after = card.getBoundingClientRect();
      const dx = before.left - after.left, dy = before.top - after.top;
      if (dx || dy) card.animate([{ transform: "translate(" + dx + "px, " + dy + "px)" }, { transform: "translate(0, 0)" }], { duration: 560, easing: "cubic-bezier(.2,.8,.2,1)" });
    });
    document.querySelectorAll("[data-bookmark]").forEach(button=>button.addEventListener("click",()=>{
      const url=button.dataset.bookmark;
      const index=bookmarks.indexOf(url);
      if(index!==-1) bookmarks.splice(index,1); else bookmarks.unshift(url);
      saveBookmarks();
      animateCardsOnNextRender=true;
      render();
    }));
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

  // Personal folders: saved locally and kept separate from the catalogue.
  document.addEventListener("click",e=>{
    if(e.target.closest("[data-folder-delete-no]")){closeFolderDeleteConfirm();return;}
    if(e.target.closest("[data-folder-delete-yes]")){
      const id=pendingDeleteFolderId;
      if(id){
        folders=folders.filter(f=>f.id!==id);
        Object.keys(folderItems).forEach(url=>{if(folderItems[url]===id)delete folderItems[url];});
        saveFolders();saveFolderItems();
        if(state.folderId===id){state.folderId=null;state.category="all";state.page=1;}
      }
      closeFolderDeleteConfirm();renderFolderBar();if(state.folderId===null)render();return;
    }
    const deleteFolder=e.target.closest("[data-delete-folder]");
    if(deleteFolder){showFolderDeleteConfirm(deleteFolder.dataset.deleteFolder);return;}
    const editFolder=e.target.closest("[data-edit-folder]");
    if(editFolder){editingFolderId=editFolder.dataset.editFolder;renderFolderBar();return;}
    if(e.target.closest("[data-cancel-folder-edit]")){editingFolderId=null;renderFolderBar();return;}
    if(e.target.closest("[data-toggle-folder-edit]")){folderEditMode=!folderEditMode;editingFolderId=null;renderFolderBar();return;}
    if(e.target.closest("[data-context-new-folder]")){
      const menu=$("#folder-context-menu"),url=menu?.dataset.url;if(!menu||!url||folders.length>=10)return;
      menu.querySelector("[data-context-new-folder]")?.remove();
      const form=document.createElement("form");form.className="context-folder-create-form";form.dataset.contextFolderCreate="true";
      form.innerHTML='<input name="folderName" maxlength="40" autocomplete="off" placeholder="نام پوشه جدید..." aria-label="نام پوشه جدید" required><button type="submit">ساخت و افزودن</button>';
      menu.appendChild(form);form.querySelector("input")?.focus();return;
    }
    const contextAction=e.target.closest("[data-context-bookmark],[data-context-favorite]");
    if(contextAction){
      const menu=$("#folder-context-menu"),url=menu?.dataset.url;if(!url)return;
      if(contextAction.hasAttribute("data-context-bookmark")){
        const index=bookmarks.indexOf(url);if(index!==-1)bookmarks.splice(index,1);else bookmarks.unshift(url);
        saveBookmarks();animateCardsOnNextRender=true;
      }else{
        if(favorites.has(url))favorites.delete(url);else favorites.add(url);
        saveFavorites();
      }
      closeFolderMenu();render();return;
    }
    const add=e.target.closest("#add-folder-button");
    if(add){
      if(folders.length>=10)return;
      folderCreateOpen=true;renderFolderBar();return;
    }
    if(e.target.closest("[data-cancel-folder]")){folderCreateOpen=false;renderFolderBar();return;}
    const filter=e.target.closest("[data-folder-filter]");
    if(filter){state.folderId=filter.dataset.folderFilter||null;state.category="all";state.subcategory=null;state.page=1;render();return;}
    const assign=e.target.closest("[data-assign-folder]");
    if(assign){
      const menu=$("#folder-context-menu"),url=menu?.dataset.url;if(!url)return;
      const id=assign.dataset.assignFolder;
      if(folderItems[url]===id)delete folderItems[url];else folderItems[url]=id;
      saveFolderItems();closeFolderMenu();renderFolderBar();if(state.folderId)render();return;
    }
    if(e.target.closest("[data-remove-folder-item]")){
      const url=$("#folder-context-menu")?.dataset.url;
      if(url){delete folderItems[url];saveFolderItems();closeFolderMenu();renderFolderBar();if(state.folderId)render();}
      return;
    }
    if(e.target.closest("[data-close-folder-menu]")){closeFolderMenu();return;}
    if(!e.target.closest("#folder-context-menu"))closeFolderMenu();
  });
  document.addEventListener("submit",e=>{
    const contextForm=e.target.closest("[data-context-folder-create]");
    if(contextForm){
      e.preventDefault();const menu=$("#folder-context-menu"),url=menu?.dataset.url;
      const input=contextForm.querySelector("input"),name=(input?.value||"").trim();
      if(!url||!name||folders.length>=10)return;
      if(folders.some(f=>f.name.trim().toLocaleLowerCase()===name.toLocaleLowerCase())){
        input.setCustomValidity("پوشه‌ای با این نام وجود دارد.");input.reportValidity();return;
      }
      const id="folder-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7);
      folders.push({id,name:name.slice(0,40)});folderItems[url]=id;saveFolders();saveFolderItems();
      closeFolderMenu();renderFolderBar();if(state.folderId)render();return;
    }
    const editForm=e.target.closest("[data-folder-edit-form]");
    if(editForm){
      e.preventDefault();const folder=folders.find(f=>f.id===editForm.dataset.folderEditForm);
      const name=(editForm.querySelector("input")?.value||"").trim();
      if(!folder||!name)return;
      if(folders.some(f=>f.id!==folder.id&&f.name.trim().toLocaleLowerCase()===name.toLocaleLowerCase())){
        const input=editForm.querySelector("input");input.setCustomValidity("پوشه‌ای با این نام وجود دارد.");input.reportValidity();return;
      }
      folder.name=name.slice(0,40);saveFolders();editingFolderId=null;renderFolderBar();return;
    }
    const form=e.target.closest("#folder-create-form");if(!form)return;
    e.preventDefault();
    const input=form.querySelector("#folder-name-input");
    const name=(input?.value||"").trim();
    if(!name){input?.focus();return;}
    if(folders.length>=10){folderCreateOpen=false;renderFolderBar();return;}
    if(folders.some(f=>f.name.trim().toLocaleLowerCase()===name.toLocaleLowerCase())){
      input.setCustomValidity("پوشه‌ای با این نام وجود دارد.");input.reportValidity();return;
    }
    folders.push({id:"folder-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7),name:name.slice(0,40)});
    saveFolders();folderCreateOpen=false;renderFolderBar();
  });
  document.addEventListener("dragstart",e=>{
    const item=e.target.closest("[data-folder-drag]");if(!item||!folderEditMode)return;
    draggedFolderId=item.dataset.folderDrag;item.classList.add("is-dragging");
    e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",draggedFolderId);
  });
  document.addEventListener("dragover",e=>{
    const target=e.target.closest("[data-folder-drag]");if(!target||!draggedFolderId)return;
    e.preventDefault();e.dataTransfer.dropEffect="move";
  });
  document.addEventListener("drop",e=>{
    const target=e.target.closest("[data-folder-drag]");if(!target||!draggedFolderId)return;
    e.preventDefault();const from=folders.findIndex(f=>f.id===draggedFolderId),to=folders.findIndex(f=>f.id===target.dataset.folderDrag);
    if(from>=0&&to>=0&&from!==to){const [moved]=folders.splice(from,1);folders.splice(to,0,moved);saveFolders();renderFolderBar();}
    draggedFolderId=null;
  });
  document.addEventListener("dragend",e=>{
    e.target.closest("[data-folder-drag]")?.classList.remove("is-dragging");draggedFolderId=null;
  });
  document.addEventListener("contextmenu",e=>{
    const target=e.target instanceof Element?e.target:e.target?.parentElement;
    const row=target?.closest(".resource-card[data-resource-url],.mega-tool-row");
    if(!row)return;
    const url=row.dataset.resourceUrl||row.querySelector(".mega-tool")?.getAttribute("href");
    if(!url)return;
    e.preventDefault();e.stopPropagation();showFolderMenu(url,e.clientX,e.clientY,row.classList.contains("resource-card")?"کارت":"ابزارک");
  },true);
  document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeFolderMenu();closeFolderDeleteConfirm();}});


  // Export and restore only user-owned browser data; catalogue resources remain in data/resources.json.
  const BACKUP_APP = "web-bookmarks";
  const BACKUP_VERSION = 1;
  const BACKUP_KEYS = {
    favorites: FAVORITES_KEY,
    bookmarks: BOOKMARKS_KEY,
    folders: FOLDERS_KEY,
    folderItems: FOLDER_ITEMS_KEY,
    theme: "library-theme"
  };
  const readBackupValue = key => {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    try { return JSON.parse(raw); } catch { return raw; }
  };
  const exportPersonalBackup = () => {
    const payload = {
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      data: { favorites: readBackupValue(FAVORITES_KEY) ?? {version:FAVORITES_VERSION,items:[...favorites]}, bookmarks: readBackupValue(BOOKMARKS_KEY) ?? bookmarks, folders: readBackupValue(FOLDERS_KEY) ?? folders, folderItems: readBackupValue(FOLDER_ITEMS_KEY) ?? folderItems, theme: readBackupValue("library-theme") }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:"application/json;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "web-bookmarks-backup-" + new Date().toISOString().slice(0,10) + ".json";
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const validateBackup = payload => {
    if (!payload || payload.app !== BACKUP_APP || payload.version !== BACKUP_VERSION || !payload.data || typeof payload.data !== "object") {
      throw new Error("این فایل، پشتیبان معتبر کتابخانه منابع وب نیست یا نسخه آن پشتیبانی نمی‌شود.");
    }
    const d = payload.data;
    const validStrings = value => Array.isArray(value) && value.every(item => typeof item === "string");
    const favoriteItems = Array.isArray(d.favorites) ? d.favorites : d.favorites && Array.isArray(d.favorites.items) ? d.favorites.items : null;
    if (!favoriteItems || !validStrings(favoriteItems)) throw new Error("اطلاعات نشان‌شده‌ها در فایل پشتیبان معتبر نیست.");
    if (!validStrings(d.bookmarks)) throw new Error("اطلاعات بوکمارک‌ها در فایل پشتیبان معتبر نیست.");
    if (!Array.isArray(d.folders) || d.folders.length > 10 || !d.folders.every(f => f && typeof f.id === "string" && typeof f.name === "string")) {
      throw new Error("ساختار پوشه‌های شخصی در فایل پشتیبان معتبر نیست.");
    }
    if (!d.folderItems || typeof d.folderItems !== "object" || Array.isArray(d.folderItems) ||
        !Object.entries(d.folderItems).every(([url,folderId]) => typeof url === "string" && typeof folderId === "string")) {
      throw new Error("ارتباط ابزارها با پوشه‌ها در فایل پشتیبان معتبر نیست.");
    }
    if (d.theme !== null && d.theme !== "light" && d.theme !== "dark") throw new Error("تنظیم پوسته در فایل پشتیبان معتبر نیست.");
    return {
      [FAVORITES_KEY]: JSON.stringify(d.favorites),
      [BOOKMARKS_KEY]: JSON.stringify(d.bookmarks),
      [FOLDERS_KEY]: JSON.stringify(d.folders),
      [FOLDER_ITEMS_KEY]: JSON.stringify(d.folderItems),
      "library-theme": d.theme === null ? null : d.theme
    };
  };
  const restorePersonalBackup = async file => {
    try {
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) throw new Error("حجم فایل پشتیبان بیش از ۵ مگابایت است.");
      const payload = JSON.parse(await file.text());
      const restored = validateBackup(payload);
      if (!window.confirm("با بازیابی این فایل، بوکمارک‌ها، نشان‌شده‌ها، پوشه‌ها و پوسته فعلی این مرورگر با اطلاعات داخل فایل جایگزین می‌شوند. ادامه می‌دهی؟")) return;
      const previous = Object.values(BACKUP_KEYS).map(key => [key, localStorage.getItem(key)]);
      try {
        for (const [key,value] of Object.entries(restored)) {
          if (value === null) localStorage.removeItem(key);
          else localStorage.setItem(key,value);
        }
      } catch (error) {
        for (const [key,value] of previous) {
          try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key,value); } catch {}
        }
        throw error;
      }
      window.alert("بازیابی با موفقیت انجام شد. صفحه برای بارگذاری اطلاعات بازگردانی‌شده تازه می‌شود.");
      window.location.reload();
    } catch (error) {
      window.alert(error instanceof SyntaxError ? "فایل انتخاب‌شده JSON معتبر نیست." : (error.message || "بازیابی فایل ناموفق بود."));
    }
  };
  $("#backup-export").addEventListener("click", exportPersonalBackup);
  $("#backup-import").addEventListener("click", () => $("#backup-file-input").click());
  $("#backup-file-input").addEventListener("change", e => {
    const file = e.target.files?.[0];
    if (file) restorePersonalBackup(file);
    e.target.value = "";
  });

  const suggestionBox=$("#search-suggestions"), searchInput=$("#search-input");
  const closeSuggestions=()=>{suggestionBox.hidden=true;searchInput.setAttribute("aria-expanded","false");state.activeSuggestion=-1;};
  const updateSuggestions=()=>{
    const q=searchInput.value.trim();
    if(!q||!state.resources.length){closeSuggestions();return;}
    const matches=state.resources.map(item=>({item,score:searchScore([item.title,item.description,item.url,item.subcategory||"",subcategoryName(item.subcategory),...(item.tags||[])].join(" "),q,item.title)}))
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
  $("#reset-search").addEventListener("click",()=>{state.category="all";state.folderId=null;state.query="";$("#search-input").value="";state.page=1;closeSuggestions();render();});
  $("#sort-select").addEventListener("change",e=>{state.sort=e.target.value;state.page=1;render();});
  $("#theme-toggle").addEventListener("click",()=>{const light=document.documentElement.classList.toggle("light");localStorage.setItem("library-theme",light?"light":"dark");});
  if(localStorage.getItem("library-theme")==="light")document.documentElement.classList.add("light");
  renderFolderBar();
  fetch("data/resources.json?v=" + ASSET_VERSION).then(r=>{if(!r.ok)throw new Error("Data unavailable");return r.json()}).then(data=>{
    state.resources=data.resources||[];state.categories=data.categories||[];render();
  }).catch(()=>{$("#total-count").textContent="بارگذاری منابع ناموفق بود";$("#resource-grid").innerHTML='<p class="card-description">فایل داده در دسترس نیست. لطفاً صفحه را دوباره بارگذاری کن.</p>';});
})();