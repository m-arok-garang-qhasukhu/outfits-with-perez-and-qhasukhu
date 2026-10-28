const KEY='opq_products_v3', CART='opq_cart_v3';
const seed=[
{id:1,name:'Classic Black Clergy Cassock',price:12500,category:'Church & Clergy',sizes:'S,M,L,XL,XXL,XXXL',description:'A dignified full-length cassock with a crisp clerical collar and refined tailoring. Ask us about made-to-measure sizing and fabric options.',new:true,featured:true,image:''},
{id:2,name:"Women's Elegant Church Dress",price:6500,category:'Church & Clergy',sizes:'8,10,12,14,16,18',description:'An elegant, comfortable dress designed for worship, celebrations and special church occasions.',new:true,featured:true,image:''},
{id:3,name:"Men's Classic Business Suit",price:14500,category:'Official Wear',sizes:'S,M,L,XL,XXL',description:'A sharp tailored suit for the office, meetings, interviews and formal occasions.',new:true,featured:true,image:''},
{id:4,name:'Tailored Blazer & Trouser Set',price:10500,category:'Official Wear',sizes:'8,10,12,14,16,18',description:'A versatile coordinated set with a clean silhouette for work and formal events.',new:false,featured:true,image:''},
{id:5,name:'Formal Dress Shirt',price:2200,category:'Official Wear',sizes:'S,M,L,XL,XXL',description:'A crisp formal shirt that pairs easily with a suit or tailored trousers.',new:false,featured:false,image:''},
{id:6,name:'Classic Accessories Set',price:1800,category:'Accessories',sizes:'One size',description:'Polished finishing touches to complete your formal look.',new:false,featured:false,image:''}
];
const money=n=>`KSh ${Number(n).toLocaleString('en-KE')}`;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let catalog=null;
function products(){if(Array.isArray(catalog))return catalog;try{const p=JSON.parse(localStorage.getItem(KEY));return Array.isArray(p)&&p.length?p:seed}catch{return seed}}
async function loadCatalog(){
 if(window.OPQ_CLOUD?.ready&&window.OPQ_SUPABASE){
  const {data,error}=await window.OPQ_SUPABASE.from('products').select('*').eq('available',true).order('created_at',{ascending:false});
  if(!error&&Array.isArray(data)){catalog=data.map(x=>({id:x.id,name:x.name,price:x.price_kes,category:x.category,sizes:(x.sizes||[]).join(','),description:x.description||'',new:!!x.is_new,featured:!!x.featured,image:x.image_url||'',available:x.available!==false}));return true}
  console.warn('Cloud catalog unavailable; using local demo catalog.',error);
 }
 catalog=null;return false;
}
function saveProducts(p){localStorage.setItem(KEY,JSON.stringify(p))}
if(!localStorage.getItem(KEY))saveProducts(seed);
let state={filter:'All',search:''},cart=[];
try{cart=JSON.parse(localStorage.getItem(CART)||'[]');if(!Array.isArray(cart))cart=[]}catch{cart=[]}
const grid=document.getElementById('productGrid'),empty=document.getElementById('emptyState');
function render(){
 let p=products();
 if(state.filter==='New')p=p.filter(x=>x.new);
 else if(state.filter!=='All')p=p.filter(x=>x.category===state.filter);
 if(state.search)p=p.filter(x=>(x.name+' '+x.category+' '+x.description).toLowerCase().includes(state.search.toLowerCase()));
 grid.innerHTML=p.map(x=>`<article class="product-card"><div class="product-image">${x.image?`<img src="${esc(x.image)}" alt="${esc(x.name)}">`:`<div class="placeholder">${x.category==='Church & Clergy'?'✦':'P/Q'}</div>`}${x.new?'<span class="badge">NEW</span>':''}<button class="quick" type="button" onclick="quickView('${esc(x.id)}')"><span aria-hidden="true">⌕</span> QUICK VIEW</button></div><div class="product-info"><h3>${esc(x.name)}</h3><div class="product-meta"><span>${esc(x.category)}</span><span class="price">${money(x.price)}</span></div></div></article>`).join('');
 empty.hidden=!!p.length;renderCart();
}
document.querySelectorAll('.filter').forEach(b=>b.onclick=()=>{document.querySelectorAll('.filter').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.filter=b.dataset.filter;render()});
document.querySelectorAll('.category-tile').forEach(b=>b.onclick=()=>{const filter=document.querySelector(`[data-filter="${b.dataset.category}"]`);if(filter)filter.click();document.getElementById('shop').scrollIntoView({behavior:'smooth'})});
document.getElementById('searchInput').oninput=e=>{state.search=e.target.value;render()};
document.getElementById('menuBtn').onclick=()=>document.getElementById('mainNav').classList.toggle('open');
function quickView(id){
 const p=products().find(x=>String(x.id)===String(id));if(!p)return;
 const sizes=(p.sizes||'').split(',').map(s=>s.trim()).filter(Boolean);const hasSizes=sizes.length>0;
 document.getElementById('productModal').innerHTML=`<button class="modal-close" type="button" aria-label="Close product details" onclick="closeModal()">×</button><div class="modal-photo">${p.image?`<img src="${esc(p.image)}" alt="${esc(p.name)}">`:`<div class="placeholder">P/Q</div>`}</div><div class="modal-copy"><p class="eyebrow">${esc(p.category)}${p.new?' • NEW':''}</p><h2>${esc(p.name)}</h2><h3 class="modal-price">${money(p.price)}</h3><p>${esc(p.description||'Thoughtfully tailored for comfort, confidence and a polished finish.')}</p>${hasSizes?`<strong class="size-label">SELECT SIZE</strong><div class="size-row" role="group" aria-label="Select size">${sizes.map((s,i)=>`<button type="button" class="${i===0?'selected':''}" aria-pressed="${i===0?'true':'false'}" onclick="selectSize(this)">${esc(s)}</button>`).join('')}</div>`:''}<p class="size-help">Need a different fit? Ask us about custom measurements.</p><div class="modal-actions"><button class="btn btn-dark" type="button" onclick="addSelectedToBag('${esc(p.id)}')">Add to bag</button><a class="btn btn-outline" target="_blank" rel="noopener" href="https://wa.me/254799281744?text=${encodeURIComponent('Hello, I am interested in '+p.name+' at '+money(p.price)+'. Please advise on sizes and availability.')}">Ask on WhatsApp</a></div></div>`;
 document.getElementById('modalBackdrop').hidden=false;document.body.classList.add('modal-open');
}
function selectSize(button){button.parentElement.querySelectorAll('button').forEach(b=>{b.classList.remove('selected');b.setAttribute('aria-pressed','false')});button.classList.add('selected');button.setAttribute('aria-pressed','true')}
function addSelectedToBag(id){const modal=document.getElementById('productModal');const selected=modal.querySelector('.size-row button.selected');const size=selected?selected.textContent.trim():'';const row=modal.querySelector('.size-row');if(row&&!size){alert('Please select a size first.');return}addCart(id,1,size);closeModal()}
function closeModal(){document.getElementById('modalBackdrop').hidden=true;document.body.classList.remove('modal-open')}
document.getElementById('modalBackdrop').onclick=e=>{if(e.target.id==='modalBackdrop')closeModal()};document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();closeCart()}});
function addCart(id,qty=1,size=''){const found=cart.find(x=>String(x.id)===String(id)&&(x.size||'')===size);if(found)found.qty+=qty;else cart.push({id,qty,size});localStorage.setItem(CART,JSON.stringify(cart));renderCart();openCart()}
function renderCart(){const wrap=document.getElementById('cartItems');let total=0,count=0;if(!cart.length)wrap.innerHTML='<div style="padding:35px 24px;color:#777;font-size:12px">Your bag is empty. Explore the collection and add a piece you love.</div>';else wrap.innerHTML=cart.map(c=>{const p=products().find(x=>String(x.id)===String(c.id));if(!p)return '';total+=p.price*c.qty;count+=c.qty;return `<div class="cart-row"><div class="cart-thumb">${p.image?`<img src="${esc(p.image)}" alt="">`:''}</div><div><h4>${esc(p.name)}</h4><small>${money(p.price)} • ${esc(p.category)}${c.size?' • Size '+esc(c.size):''}</small><div class="qty"><button type="button" aria-label="Decrease quantity" onclick="changeQty('${esc(p.id)}',-1,'${esc(c.size||'')}')">−</button><span>${c.qty}</span><button type="button" aria-label="Increase quantity" onclick="changeQty('${esc(p.id)}',1,'${esc(c.size||'')}')">+</button></div></div><b>${money(p.price*c.qty)}</b></div>`}).join('');document.getElementById('cartTotal').textContent=money(total);document.getElementById('cartCount').textContent=count}
function changeQty(id,d,size=''){const x=cart.find(c=>String(c.id)===String(id)&&(c.size||'')===size);if(!x)return;x.qty+=d;if(x.qty<=0)cart=cart.filter(c=>!(String(c.id)===String(id)&&(c.size||'')===size));localStorage.setItem(CART,JSON.stringify(cart));renderCart()}
function openCart(){document.getElementById('cartDrawer').classList.add('open');document.getElementById('drawerOverlay').hidden=false}
function closeCart(){document.getElementById('cartDrawer').classList.remove('open');document.getElementById('drawerOverlay').hidden=true}
document.getElementById('cartBtn').onclick=openCart;document.getElementById('closeCart').onclick=closeCart;document.getElementById('drawerOverlay').onclick=closeCart;
document.getElementById('clearCart').onclick=()=>{cart=[];localStorage.setItem(CART,'[]');renderCart()};
document.getElementById('whatsappOrder').onclick=()=>{if(!cart.length)return alert('Your bag is empty.');const lines=cart.map(c=>{const p=products().find(x=>String(x.id)===String(c.id));return p?`• ${p.name}${c.size?' (Size '+c.size+')':''} x${c.qty} — ${money(p.price*c.qty)}`:''}).filter(Boolean).join('\n');const total=cart.reduce((sum,c)=>{const p=products().find(x=>String(x.id)===String(c.id));return sum+(p?p.price*c.qty:0)},0);window.open('https://wa.me/254799281744?text='+encodeURIComponent(`Hello Outfits with Perez & Qhasukhu 👋\nI'd like to order:\n${lines}\n\nEstimated total: ${money(total)}\nPlease confirm availability, sizing and delivery.`),'_blank','noopener')};
window.quickView=quickView;window.closeModal=closeModal;window.addCart=addCart;window.addSelectedToBag=addSelectedToBag;window.selectSize=selectSize;window.changeQty=changeQty;
(async()=>{await loadCatalog();render()})();
