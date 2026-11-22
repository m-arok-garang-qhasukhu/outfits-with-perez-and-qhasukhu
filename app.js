const KEY='opq_products_v3', CART='opq_cart_v3', SAVED='opq_saved_v1', RECENT='opq_recent_v1';
const seed=[
{id:1,name:"Men's 3-Piece Suit",price:8500,category:"Men",sizes:"S,M,L,XL,XXL",description:"A polished three-piece look designed for Sunday service, formal gatherings and special occasions.",new:true,featured:true,image:""},
{id:2,name:"Women's Church Dress",price:6500,category:"Women",sizes:"8,10,12,14,16,18",description:"An elegant church dress with a refined silhouette and comfortable finish.",new:true,featured:true,image:""},
{id:3,name:"Men's Classic Blazer",price:7000,category:"Men",sizes:"S,M,L,XL,XXL",description:"A versatile tailored blazer that works beautifully with formal trousers or a smart shirt.",new:false,featured:true,image:""},
{id:4,name:"Dress & Hat Set",price:7500,category:"Women",sizes:"8,10,12,14,16,18",description:"A coordinated Sunday set for a complete, graceful look.",new:true,featured:false,image:""},
{id:5,name:"Men's Formal Shirt",price:2000,category:"Men",sizes:"S,M,L,XL,XXL",description:"A crisp formal shirt for church, meetings and celebrations.",new:false,featured:false,image:""},
{id:6,name:"Women's Tailored Blazer",price:5500,category:"Women",sizes:"8,10,12,14,16,18",description:"A structured blazer that adds polish to dresses, skirts and trousers.",new:false,featured:false,image:""}
];
const money=n=>`KSh ${Number(n).toLocaleString('en-KE')}`;
let catalog=null, productRatings={}, productReviews={};
function products(){if(Array.isArray(catalog))return catalog;try{const p=JSON.parse(localStorage.getItem(KEY));return Array.isArray(p)&&p.length?p:seed}catch{return seed}}
function normalizeProductSizes(value){return Array.isArray(value)?value.map(v=>String(v).trim()).filter(Boolean).join(','):String(value||'').trim()}
async function loadCatalog(){
 if(window.OPQ_CLOUD?.ready && window.OPQ_SUPABASE){
   const pageSize=500, rows=[];
   for(let from=0;;from+=pageSize){
     const {data,error}=await window.OPQ_SUPABASE.from('products').select('*').eq('available',true).order('created_at',{ascending:false}).range(from,from+pageSize-1);
     if(error){console.warn('Cloud catalog unavailable; using demo catalog.',error);catalog=null;return false}
     rows.push(...(data||[]));
     if(!data||data.length<pageSize)break;
   }
   catalog=rows.map(x=>({id:x.id,name:x.name,price:x.price_kes,category:x.category,sizes:normalizeProductSizes(x.sizes),description:x.description||'',new:!!x.is_new,featured:!!x.featured,image:x.image_url||'',available:x.available!==false,stockQuantity:x.stock_quantity,lowStockThreshold:x.low_stock_threshold}));
   productRatings={};productReviews={};
   const {data:reviews,error:reviewError}=await window.OPQ_SUPABASE.from('public_product_reviews').select('product_id,rating,review_text,reviewer_name,created_at').not('product_id','is',null).order('created_at',{ascending:false});
   if(!reviewError){for(const review of reviews||[]){if(!review.product_id)continue;const key=String(review.product_id);if(!productRatings[key])productRatings[key]={sum:0,count:0};productRatings[key].sum+=Number(review.rating)||0;productRatings[key].count++;if(!productReviews[key])productReviews[key]=[];productReviews[key].push(review);}}else console.warn('Approved product reviews unavailable:',reviewError);
   return true;
 }
 catalog=null;
 return false;
}
function saveProducts(p){localStorage.setItem(KEY,JSON.stringify(p))}
if(!localStorage.getItem(KEY))saveProducts(seed);
let state={filter:'All',search:'',sort:'featured',inStockOnly:false,minPrice:'',maxPrice:'',size:'',page:1}, cart=JSON.parse(localStorage.getItem(CART)||'[]');
let savedProducts=[];try{savedProducts=JSON.parse(localStorage.getItem(SAVED)||'[]').map(String)}catch{savedProducts=[]}
let recentlyViewed=[];try{recentlyViewed=JSON.parse(localStorage.getItem(RECENT)||'[]').map(String).slice(0,4)}catch{recentlyViewed=[]}
function saveFavorites(){localStorage.setItem(SAVED,JSON.stringify(savedProducts));const count=document.getElementById('savedCount');if(count)count.textContent=savedProducts.length;}

const grid=document.getElementById('productGrid'), empty=document.getElementById('emptyState');
function renderRecentlyViewed(){
 const wrap=document.getElementById('recentlyViewedWrap'),target=document.getElementById('recentlyViewedGrid');
 if(!wrap||!target)return;
 const items=recentlyViewed.map(id=>products().find(p=>String(p.id)===id)).filter(Boolean).slice(0,4);
 wrap.hidden=!items.length;
 target.innerHTML=items.map(p=>`<button class="recent-view-card" type="button" onclick='quickView(${JSON.stringify(String(p.id))})'><span class="recent-view-thumb">${p.image?`<img src="${escapeReviewText(p.image)}" alt="">`:'<span>P/Q</span>'}</span><span class="recent-view-copy"><strong>${escapeReviewText(p.name)}</strong><small>${money(p.price)}</small></span><span class="recent-view-arrow" aria-hidden="true">↗</span></button>`).join('');
}
function renderCatalogPagination(totalPages){
 const host=document.getElementById('catalogPagination');if(!host)return;
 if(totalPages<=1){host.innerHTML='';host.hidden=true;return;}
 host.hidden=false;
 const button=(label,page,disabled=false,current=false)=>`<button type="button" class="catalog-page-btn ${current?'active':''}" data-page="${page}" ${disabled?'disabled':''} ${current?'aria-current="page"':''}>${label}</button>`;
 const pages=[];for(let n=1;n<=totalPages;n++){if(n===1||n===totalPages||Math.abs(n-state.page)<=1)pages.push(n);}
 let markup=button('Previous',state.page-1,state.page===1);
 let previous=0;for(const n of pages){if(previous&&n-previous>1)markup+='<span class="catalog-page-gap" aria-hidden="true">…</span>';markup+=button(String(n),n,false,n===state.page);previous=n;}
 markup+=button('Next',state.page+1,state.page===totalPages);host.innerHTML=markup;
 host.querySelectorAll('button[data-page]').forEach(b=>b.addEventListener('click',()=>{const next=Number(b.dataset.page);if(next<1||next>totalPages||next===state.page)return;state.page=next;render();document.getElementById('catalog-refinements')?.scrollIntoView({behavior:'smooth',block:'start'});}));
}
function render(){
 let p=products().filter(x=>{
  const categoryMatch=state.filter==='All'||(state.filter==='New'?!!x.new:state.filter==='Saved'?savedProducts.includes(String(x.id)):x.category===state.filter);
  const searchMatch=!state.search||(x.name+' '+x.category+' '+(x.description||'')).toLowerCase().includes(state.search.toLowerCase());
  const sizeMatch=!state.size||(x.sizes||'').split(',').map(v=>v.trim().toLowerCase()).includes(state.size.toLowerCase());
  const known=x.stockQuantity!==null&&x.stockQuantity!==undefined;
  const price=Number(x.price)||0;const aboveMin=state.minPrice===''||price>=Number(state.minPrice);const belowMax=state.maxPrice===''||price<=Number(state.maxPrice);
  return categoryMatch&&searchMatch&&sizeMatch&&aboveMin&&belowMax&&(!state.inStockOnly||(known&&Number(x.stockQuantity)>0));
 });
 if(state.sort==='price-asc')p.sort((a,b)=>Number(a.price)-Number(b.price));
 else if(state.sort==='price-desc')p.sort((a,b)=>Number(b.price)-Number(a.price));
 else if(state.sort==='rating')p.sort((a,b)=>{const ra=productRatings[String(a.id)]||{sum:0,count:0},rb=productRatings[String(b.id)]||{sum:0,count:0};return (rb.count?rb.sum/rb.count:0)-(ra.count?ra.sum/ra.count:0)||rb.count-ra.count});
 else if(state.sort==='name')p.sort((a,b)=>String(a.name).localeCompare(String(b.name)));
 else p.sort((a,b)=>Number(!!b.featured)-Number(!!a.featured));
 const pageSize=24,totalPages=Math.max(1,Math.ceil(p.length/pageSize));state.page=Math.min(Math.max(1,state.page),totalPages);const start=(state.page-1)*pageSize;const visible=p.slice(start,start+pageSize);
 grid.innerHTML=visible.map(x=>`<article class="product-card"><div class="product-image">${x.image?`<img src="${x.image}" alt="${x.name}">`:`<div class="placeholder">${x.category==='Men'?'M':'W'}</div>`}${x.new?'<span class="badge">NEW</span>':''}<button class="favorite-btn ${savedProducts.includes(String(x.id))?'is-saved':''}" type="button" aria-label="${savedProducts.includes(String(x.id))?'Remove from':'Save to'} favourites" aria-pressed="${savedProducts.includes(String(x.id))}" onclick='toggleFavorite(${JSON.stringify(String(x.id))})'>${savedProducts.includes(String(x.id))?'♥':'♡'}</button>${x.stockQuantity===0?'<span class="stock-badge out">OUT OF STOCK</span>':x.stockQuantity!==null&&x.stockQuantity!==undefined&&x.stockQuantity<=Number(x.lowStockThreshold??3)?'<span class="stock-badge low">LOW STOCK</span>':''}<button class="quick" ${x.stockQuantity===0?'disabled':''} onclick='quickView(${JSON.stringify(String(x.id))})'>${x.stockQuantity===0?'OUT OF STOCK':'QUICK VIEW'}</button></div><div class="product-info"><h3>${x.name}</h3><div class="product-meta"><span>${x.category}</span><span class="price">${money(x.price)}</span></div><div class="product-rating" aria-label="Customer rating">${productRatings[String(x.id)] ? "★ "+(productRatings[String(x.id)].sum/productRatings[String(x.id)].count).toFixed(1)+" · "+productRatings[String(x.id)].count+" review"+(productRatings[String(x.id)].count===1?"":"s") : "No reviews yet"}</div></div></article>`).join('');
 const count=document.getElementById('catalogResultCount');if(count)count.textContent=p.length?`Showing ${start+1}–${Math.min(start+pageSize,p.length)} of ${p.length} matching pieces (${products().length} listed)`: `No matching pieces (${products().length} listed)`;renderCatalogPagination(totalPages);
 empty.textContent=state.filter==='Saved'?'You have not saved any favourites yet. Tap the heart on a piece to keep it here.':'No pieces match your search yet.';
 empty.hidden=!!p.length;saveFavorites();renderCart();renderRecentlyViewed();
}
document.querySelectorAll('.filter').forEach(b=>b.onclick=()=>{document.querySelectorAll('.filter').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.filter=b.dataset.filter;render()});
document.querySelectorAll('.category-tile').forEach(b=>b.onclick=()=>{document.querySelector(`[data-filter="${b.dataset.category}"]`).click();document.getElementById('shop').scrollIntoView()});
document.getElementById('searchInput').oninput=e=>{state.search=e.target.value;render()};
document.getElementById('catalogSearchBtn')?.addEventListener('click',()=>{const input=document.getElementById('searchInput');state.search=input.value;state.page=1;render();input.focus()});
document.getElementById('searchInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();state.search=e.currentTarget.value;state.page=1;render();e.currentTarget.blur()}});
document.getElementById('sortSelect')?.addEventListener('change',e=>{state.sort=e.target.value;render()});
document.getElementById('sizeSelect')?.addEventListener('change',e=>{state.size=e.target.value;render()});
document.getElementById('inStockOnly')?.addEventListener('change',e=>{state.inStockOnly=e.target.checked;render()});
['minPrice','maxPrice'].forEach(id=>document.getElementById(id)?.addEventListener('input',e=>{state[id==='minPrice'?'minPrice':'maxPrice']=e.target.value;const min=Number(state.minPrice),max=Number(state.maxPrice);const maxInput=document.getElementById('maxPrice');if(state.minPrice!==''&&state.maxPrice!==''&&min>max){maxInput.setCustomValidity('Maximum price must be at least the minimum price.')}else{maxInput.setCustomValidity('')}render()}));
document.getElementById('clearPriceFilter')?.addEventListener('click',()=>{state.minPrice='';state.maxPrice='';document.getElementById('minPrice').value='';document.getElementById('maxPrice').value='';document.getElementById('maxPrice').setCustomValidity('');render()});
document.getElementById('menuBtn').onclick=()=>document.getElementById('mainNav').classList.toggle('open');

function toggleFavorite(id){id=String(id);savedProducts=savedProducts.includes(id)?savedProducts.filter(x=>x!==id):[...savedProducts,id];saveFavorites();render();}
function escapeReviewText(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function quickView(id){
 const p=products().find(x=>String(x.id)===String(id)); if(!p)return;
 recentlyViewed=[String(id),...recentlyViewed.filter(x=>x!==String(id))].slice(0,4);localStorage.setItem(RECENT,JSON.stringify(recentlyViewed));renderRecentlyViewed();
 const sizes=(p.sizes||'').split(',').map(s=>s.trim()).filter(Boolean);selectedProductSize=sizes[0]||'';
 const reviews=productReviews[String(p.id)]||[];const reviewMarkup=reviews.length?`<section class="quick-reviews"><div class="quick-reviews-head"><strong>Customer reviews</strong><span>★ ${(reviews.reduce((sum,r)=>sum+Number(r.rating||0),0)/reviews.length).toFixed(1)} · ${reviews.length} review${reviews.length===1?'':'s'}</span></div>${reviews.slice(0,3).map(r=>`<article class="quick-review"><div class="quick-review-stars" aria-label="${Number(r.rating)||0} out of 5 stars">${'★'.repeat(Math.max(0,Math.min(5,Number(r.rating)||0)))}${'☆'.repeat(5-Math.max(0,Math.min(5,Number(r.rating)||0)))}</div><p>${escapeReviewText(r.review_text)}</p><small>${escapeReviewText(r.reviewer_name||'Verified customer')}${r.created_at?' · '+new Date(r.created_at).toLocaleDateString('en-KE'):''}</small></article>`).join('')}</section>`:`<section class="quick-reviews"><strong>Customer reviews</strong><p class="no-product-reviews">No approved reviews for this piece yet. Be the first to share your experience after purchase.</p></section>`;
 document.getElementById('productModal').innerHTML=`<button class="modal-close" onclick="closeModal()">×</button><div class="modal-photo">${p.image?`<img src="${p.image}" alt="${p.name}">`:`<div class="placeholder">P/Q</div>`}</div><div class="modal-copy"><p class="eyebrow">${p.category}${p.new?' • NEW':''}</p><h2>${p.name}</h2><h3>${money(p.price)}</h3><p>${p.description||'Beautifully tailored for your Sunday look.'}</p><strong style="font-size:10px;letter-spacing:.1em">SELECT SIZE</strong><div class="size-row">${sizes.map((s,i)=>`<button type="button" class="${i===0?'selected':''}" data-size="${s}" onclick="selectSize(this)">${s}</button>`).join('')}</div>${reviewMarkup}<button class="modal-favorite ${savedProducts.includes(String(p.id))?'is-saved':''}" type="button" aria-pressed="${savedProducts.includes(String(p.id))}" onclick='toggleFavorite(${JSON.stringify(String(p.id))});quickView(${JSON.stringify(String(p.id))})'>${savedProducts.includes(String(p.id))?'♥ Saved to favourites':'♡ Save to favourites'}</button><div class="modal-actions"><button class="btn share-product-btn" type="button" onclick='shareProduct(${JSON.stringify(String(p.id))})'>↗ Share this piece</button>${p.stockQuantity===0?'<strong class="stock-badge out">Currently out of stock</strong>':`<button class="btn btn-dark" onclick='addSelectedToCart(${JSON.stringify(String(p.id))})'>Add to bag</button>`}<a class="btn" style="border:1px solid #ddd" target="_blank" href="https://wa.me/254799281744?text=${encodeURIComponent('Hello, I am interested in '+p.name+' at '+money(p.price)+'.')}">Ask on WhatsApp</a></div></div>`;
 document.getElementById('modalBackdrop').hidden=false;
}
async function shareProduct(id){
 const p=products().find(x=>String(x.id)===String(id));if(!p)return;
 const url=new URL(location.href);url.searchParams.set('product',String(p.id));url.hash='shop';
 const shareData={title:p.name+' | Outfits with Perez & Qhasukhu',text:'Take a look at '+p.name+' at '+money(p.price)+' from P&Q.',url:url.toString()};
 try{
  if(navigator.share){await navigator.share(shareData);return;}
  if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(url.toString());alert('Product link copied. You can now share it with friends.');return;}
  const field=document.createElement('textarea');field.value=url.toString();field.setAttribute('readonly','');field.style.position='fixed';field.style.opacity='0';document.body.appendChild(field);field.select();const copied=document.execCommand('copy');field.remove();alert(copied?'Product link copied. You can now share it with friends.':'Copy this product link: '+url.toString());
 }catch(error){if(error&&error.name!=='AbortError')alert('Unable to share automatically. Product link: '+url.toString());}
}
let selectedProductSize='';
function selectSize(button){button.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('selected'));button.classList.add('selected');selectedProductSize=button.dataset.size||''}
function addSelectedToCart(id){const modal=document.getElementById('productModal');const sizeBtn=modal.querySelector('.size-row button.selected');const size=sizeBtn?.dataset.size||'';addCart(id,1,size);closeModal()}
function closeModal(){document.getElementById('modalBackdrop').hidden=true}
document.getElementById('modalBackdrop').onclick=e=>{if(e.target.id==='modalBackdrop')closeModal()};

function addCart(id,qty=1,size=''){id=String(id);const p=products().find(x=>String(x.id)===id);if(!p)return;if(p.stockQuantity===0){alert('This item is currently out of stock.');return;}const found=cart.find(x=>String(x.id)===id&&String(x.size||'')===String(size||''));const next=(found?.qty||0)+qty;if(p.stockQuantity!==null&&p.stockQuantity!==undefined&&next>p.stockQuantity){alert('Only '+p.stockQuantity+' item(s) remain in stock.');return;}if(found)found.qty=next;else cart.push({id,qty,size:size||''});localStorage.setItem(CART,JSON.stringify(cart));renderCart();openCart()}
function renderCart(){
 const wrap=document.getElementById('cartItems');let total=0,count=0;
 if(!cart.length){wrap.innerHTML='<div style="padding:35px 24px;color:#777;font-size:12px">Your bag is empty. Add a piece from the collection.</div>'}
 else wrap.innerHTML=cart.map(c=>{const p=products().find(x=>String(x.id)===String(c.id));if(!p)return `<div class="cart-row"><div><strong>Item unavailable</strong><small>This item may have been removed from the catalogue.</small></div><button onclick='removeCartItem(${JSON.stringify(String(c.id))},${JSON.stringify(String(c.size||''))})'>Remove</button></div>`;total+=p.price*c.qty;count+=c.qty;return `<div class="cart-row"><div class="cart-thumb">${p.image?`<img src="${p.image}" alt="">`:''}</div><div><h4>${p.name}</h4><small>${money(p.price)} • ${p.category}${c.size?` • Size ${c.size}`:''}</small><div class="qty"><button onclick='changeQty(${JSON.stringify(String(p.id))},-1,${JSON.stringify(String(c.size||''))})'>−</button><span>${c.qty}</span><button onclick='changeQty(${JSON.stringify(String(p.id))},1,${JSON.stringify(String(c.size||''))})'>+</button></div></div><b>${money(p.price*c.qty)}</b></div>`}).join('');
 document.getElementById('cartTotal').textContent=money(total);document.getElementById('cartCount').textContent=count;
}
function removeCartItem(id,size=''){cart=cart.filter(c=>!(String(c.id)===String(id)&&String(c.size||'')===String(size||'')));localStorage.setItem(CART,JSON.stringify(cart));renderCart()}
function changeQty(id,d,size=''){const x=cart.find(c=>String(c.id)===String(id)&&String(c.size||'')===String(size||''));if(!x)return;const p=products().find(v=>String(v.id)===String(id));if(d>0&&p&&p.stockQuantity!==null&&p.stockQuantity!==undefined&&x.qty+d>p.stockQuantity){alert('Only '+p.stockQuantity+' item(s) remain in stock.');return;}if(d>0&&p?.stockQuantity===0){alert('This item is currently out of stock.');return;}x.qty+=d;if(x.qty<=0)cart=cart.filter(c=>!(String(c.id)===String(id)&&String(c.size||'')===String(size||'')));localStorage.setItem(CART,JSON.stringify(cart));renderCart()}
function openCart(){document.getElementById('cartDrawer').classList.add('open');document.getElementById('drawerOverlay').hidden=false}
function closeCart(){document.getElementById('cartDrawer').classList.remove('open');document.getElementById('drawerOverlay').hidden=true}
document.getElementById('cartBtn').onclick=openCart;document.getElementById('closeCart').onclick=closeCart;document.getElementById('drawerOverlay').onclick=closeCart;
document.getElementById('clearCart').onclick=()=>{cart=[];localStorage.setItem(CART,'[]');renderCart()};
const checkoutForm=document.getElementById('checkoutForm');
document.getElementById('checkoutStart').onclick=async()=>{
 if(!cart.length){alert('Your bag is empty.');return;}
 if(!window.OPQ_CLOUD?.ready||!window.OPQ_SUPABASE){alert('Online order submission is not configured yet. Please contact us on WhatsApp while the store setup is completed.');return;}
 const {data:{session}}=await window.OPQ_SUPABASE.auth.getSession();
 if(!session){window.location.href='account.html?return=checkout';return;}
 checkoutForm.hidden=false;document.getElementById('checkoutStart').hidden=true;document.getElementById('checkoutMessage').textContent='';
};
document.getElementById('checkoutCancel').onclick=()=>{checkoutForm.hidden=true;document.getElementById('checkoutStart').hidden=false};
checkoutForm.onsubmit=async e=>{
 e.preventDefault(); const btn=document.getElementById('submitOrder'),msg=document.getElementById('checkoutMessage');
 if(!cart.length){msg.textContent='Your bag is empty.';return;}
 if(!document.getElementById('checkoutTerms').checked){msg.textContent='Please accept the Terms & Policies before submitting your order.';return;}
 const items=cart.map(c=>({product_id:String(c.id),quantity:Number(c.qty),size:String(c.size||'')}));
 btn.disabled=true;btn.textContent='Submitting order…';msg.textContent='';
 try{
   const payload={p_customer_name:document.getElementById('checkoutName').value.trim(),p_phone:document.getElementById('checkoutPhone').value.trim(),p_delivery_address:document.getElementById('checkoutCountry').value+' — '+document.getElementById('checkoutAddress').value.trim(),p_notes:document.getElementById('checkoutNotes').value.trim()+'\\n[Terms & Policies accepted: P&Q-2026-01 at '+new Date().toISOString()+']',p_items:items};
   const {data,error}=await window.OPQ_SUPABASE.rpc('create_customer_order',payload); if(error)throw error;
   const orderId=typeof data==='string'?data:(data?.order_id||data?.id||data?.[0]?.order_id);
   if(!orderId)throw new Error('The order may have been received, but no order reference was returned. Please contact us before submitting again.');
   const orderRef=String(orderId).slice(0,8).toUpperCase();
   const msgText=`Hello Outfits with Perez & Qhasukhu 👋\nI submitted website order #${orderRef}. Please confirm payment instructions and delivery.\nName: ${payload.p_customer_name}\nPhone: ${payload.p_phone}`;
   cart=[];localStorage.setItem(CART,'[]');renderCart();checkoutForm.reset();checkoutForm.hidden=true;document.getElementById('checkoutStart').hidden=false;
   msg.textContent='';alert(`Order submitted successfully! Reference: ${orderRef}. You can track its progress in My account. We will now open WhatsApp so you can coordinate payment.`);
   closeCart();window.open('https://wa.me/254799281744?text='+encodeURIComponent(msgText),'_blank');
 }catch(err){console.error(err);msg.textContent='Order was not submitted: '+(err.message||'Please try again or contact us on WhatsApp.');}
 finally{btn.disabled=false;btn.textContent='Submit order';}
};
window.quickView=quickView;window.shareProduct=shareProduct;window.toggleFavorite=toggleFavorite;window.closeModal=closeModal;window.addCart=addCart;window.changeQty=changeQty;window.selectSize=selectSize;window.addSelectedToCart=addSelectedToCart;window.removeCartItem=removeCartItem;
const faqAnswers=[
 {keys:['deposit','30%','70%','payment'],answer:'Custom tailoring uses a 30% deposit and 70% balance after the quotation is agreed. Payment is coordinated manually through WhatsApp for now; automated M-Pesa checkout is not yet available.'},
 {keys:['track','tracking','order status','where is my order'],answer:'Sign in to My Account to view orders placed under your account and their current progress.'},
 {keys:['tailor','custom','measure','measurement'],answer:'Submit a custom tailoring request from My Account. Add your garment type, fabric, colour, style, measurements and optional reference image. Our team will review it before confirming the quotation and timing.'},
 {keys:['delivery','deliver','country','uganda','south sudan','rwanda','burundi','tanzania'],answer:'We welcome enquiries from Kenya, Uganda, South Sudan, Rwanda, Burundi and Tanzania. Delivery options, cost and timing are confirmed individually before an order is accepted.'},
 {keys:['cancel','cancellation','refund'],answer:'Eligible orders can request cancellation in My Account. The team reviews the request; approval does not automatically mean a refund or deposit return.'},
 {keys:['wrong size','wrong measurement','incorrect measurement','fit'],answer:'Contact our team promptly on WhatsApp so we can review the garment stage and discuss available options. Adjustments may affect timing or cost.'}
];
document.getElementById('faqAsk')?.addEventListener('click',()=>{const q=document.getElementById('faqQuestion').value.trim().toLowerCase();const hit=faqAnswers.find(x=>x.keys.some(k=>q.includes(k)));document.getElementById('faqAnswer').textContent=q?(hit?hit.answer:'I could not confidently answer that. Please contact our team on WhatsApp at +254 799 281 744 and we will help.'): 'Please type a question first.';});
async function loadPublicReviews(){const box=document.getElementById('publicReviews');if(!box||!window.OPQ_CLOUD?.ready||!window.OPQ_SUPABASE)return;const {data,error}=await window.OPQ_SUPABASE.from('public_product_reviews').select('reviewer_name,rating,review_text,product_name,tailoring_garment_type').order('created_at',{ascending:false}).limit(6);if(error||!data?.length)return;box.innerHTML=data.map(r=>{const subject=r.product_name||('Custom tailoring · '+(r.tailoring_garment_type||'P&Q tailoring'));return `<article class="review-card"><div class="review-stars" aria-label="${r.rating} out of 5 stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div><p>“${String(r.review_text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}”</p><b>${String(r.reviewer_name).replace(/[&<>"']/g,'')}</b><small>Verified customer · ${String(subject).replace(/[&<>"']/g,'')}</small></article>`}).join('');}
const guideBackdrop=document.getElementById('guideBackdrop');document.getElementById('guideOpen')?.addEventListener('click',e=>{e.preventDefault();guideBackdrop.hidden=false});document.getElementById('guideClose')?.addEventListener('click',()=>guideBackdrop.hidden=true);guideBackdrop?.addEventListener('click',e=>{if(e.target===guideBackdrop)guideBackdrop.hidden=true});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&guideBackdrop)guideBackdrop.hidden=true});
(async()=>{await loadCatalog();const sizeSelect=document.getElementById('sizeSelect');if(sizeSelect){const sizes=[...new Set(products().flatMap(p=>(p.sizes||'').split(',').map(v=>v.trim()).filter(Boolean)))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'}));sizeSelect.innerHTML='<option value="">All sizes</option>'+sizes.map(size=>`<option value="${escapeReviewText(size)}">${escapeReviewText(size)}</option>`).join('');}render();await loadPublicReviews();const sharedProduct=new URLSearchParams(location.search).get('product');if(sharedProduct&&products().some(p=>String(p.id)===String(sharedProduct)))quickView(sharedProduct);if(new URLSearchParams(location.search).get('checkout')==='1'){openCart();document.getElementById('checkoutStart').click()}})();
