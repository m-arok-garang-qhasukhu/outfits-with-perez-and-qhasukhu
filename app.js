const KEY='opq_products_v3', CART='opq_cart_v3';
const seed=[
{id:1,name:"Men's 3-Piece Suit",price:8500,category:"Men",sizes:"S,M,L,XL,XXL",description:"A polished three-piece look designed for Sunday service, formal gatherings and special occasions.",new:true,featured:true,image:""},
{id:2,name:"Women's Church Dress",price:6500,category:"Women",sizes:"8,10,12,14,16,18",description:"An elegant church dress with a refined silhouette and comfortable finish.",new:true,featured:true,image:""},
{id:3,name:"Men's Classic Blazer",price:7000,category:"Men",sizes:"S,M,L,XL,XXL",description:"A versatile tailored blazer that works beautifully with formal trousers or a smart shirt.",new:false,featured:true,image:""},
{id:4,name:"Dress & Hat Set",price:7500,category:"Women",sizes:"8,10,12,14,16,18",description:"A coordinated Sunday set for a complete, graceful look.",new:true,featured:false,image:""},
{id:5,name:"Men's Formal Shirt",price:2000,category:"Men",sizes:"S,M,L,XL,XXL",description:"A crisp formal shirt for church, meetings and celebrations.",new:false,featured:false,image:""},
{id:6,name:"Women's Tailored Blazer",price:5500,category:"Women",sizes:"8,10,12,14,16,18",description:"A structured blazer that adds polish to dresses, skirts and trousers.",new:false,featured:false,image:""}
];
const money=n=>`KSh ${Number(n).toLocaleString('en-KE')}`;
let catalog=null;
function products(){if(Array.isArray(catalog))return catalog;try{const p=JSON.parse(localStorage.getItem(KEY));return Array.isArray(p)&&p.length?p:seed}catch{return seed}}
async function loadCatalog(){
 if(window.OPQ_CLOUD?.ready && window.OPQ_SUPABASE){
   const {data,error}=await window.OPQ_SUPABASE.from('products').select('*').eq('available',true).order('created_at',{ascending:false});
   if(!error && Array.isArray(data)){catalog=data.map(x=>({id:x.id,name:x.name,price:x.price_kes,category:x.category,sizes:(x.sizes||[]).join(','),description:x.description||'',new:!!x.is_new,featured:!!x.featured,image:x.image_url||'',available:x.available!==false}));cart=[];localStorage.setItem(CART,'[]');return true}
   console.warn('Cloud catalog unavailable; using demo catalog.',error);
 }
 catalog=null;
 return false;
}
function saveProducts(p){localStorage.setItem(KEY,JSON.stringify(p))}
if(!localStorage.getItem(KEY))saveProducts(seed);
let state={filter:'All',search:''}, cart=JSON.parse(localStorage.getItem(CART)||'[]');

const grid=document.getElementById('productGrid'), empty=document.getElementById('emptyState');
function render(){
 let p=products().filter(x=>state.filter==='All'||state.filter==='New'?state.filter==='New'?x.new:x.category===state.filter:true);
 if(state.filter!=='All'&&state.filter!=='New')p=products().filter(x=>x.category===state.filter);
 if(state.search)p=p.filter(x=>(x.name+' '+x.category+' '+x.description).toLowerCase().includes(state.search.toLowerCase()));
 grid.innerHTML=p.map(x=>`<article class="product-card">
 <div class="product-image">${x.image?`<img src="${x.image}" alt="${x.name}">`:`<div class="placeholder">${x.category==='Men'?'M':'W'}</div>`}${x.new?'<span class="badge">NEW</span>':''}<button class="quick" onclick="quickView(${x.id})">QUICK VIEW</button></div>
 <div class="product-info"><h3>${x.name}</h3><div class="product-meta"><span>${x.category}</span><span class="price">${money(x.price)}</span></div></div></article>`).join('');
 empty.hidden=!!p.length; renderCart();
}
document.querySelectorAll('.filter').forEach(b=>b.onclick=()=>{document.querySelectorAll('.filter').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.filter=b.dataset.filter;render()});
document.querySelectorAll('.category-tile').forEach(b=>b.onclick=()=>{document.querySelector(`[data-filter="${b.dataset.category}"]`).click();document.getElementById('shop').scrollIntoView()});
document.getElementById('searchInput').oninput=e=>{state.search=e.target.value;render()};
document.getElementById('menuBtn').onclick=()=>document.getElementById('mainNav').classList.toggle('open');

function quickView(id){
 const p=products().find(x=>x.id===id); if(!p)return;
 const sizes=(p.sizes||'').split(',').map(s=>s.trim()).filter(Boolean);
 document.getElementById('productModal').innerHTML=`<button class="modal-close" onclick="closeModal()">×</button><div class="modal-photo">${p.image?`<img src="${p.image}" alt="${p.name}">`:`<div class="placeholder">P/Q</div>`}</div><div class="modal-copy"><p class="eyebrow">${p.category}${p.new?' • NEW':''}</p><h2>${p.name}</h2><h3>${money(p.price)}</h3><p>${p.description||'Beautifully tailored for your Sunday look.'}</p><strong style="font-size:10px;letter-spacing:.1em">SELECT SIZE</strong><div class="size-row">${sizes.map((s,i)=>`<button class="${i===0?'selected':''}" onclick="this.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('selected'));this.classList.add('selected')">${s}</button>`).join('')}</div><div class="modal-actions"><button class="btn btn-dark" onclick="addCart(${p.id},1);closeModal()">Add to bag</button><a class="btn" style="border:1px solid #ddd" target="_blank" href="https://wa.me/254799281744?text=${encodeURIComponent('Hello, I am interested in '+p.name+' at '+money(p.price)+'.')}">Ask on WhatsApp</a></div></div>`;
 document.getElementById('modalBackdrop').hidden=false;
}
function closeModal(){document.getElementById('modalBackdrop').hidden=true}
document.getElementById('modalBackdrop').onclick=e=>{if(e.target.id==='modalBackdrop')closeModal()};

function addCart(id,qty=1){const found=cart.find(x=>x.id===id);if(found)found.qty+=qty;else cart.push({id,qty});localStorage.setItem(CART,JSON.stringify(cart));renderCart();openCart()}
function renderCart(){
 const wrap=document.getElementById('cartItems');let total=0,count=0;
 if(!cart.length){wrap.innerHTML='<div style="padding:35px 24px;color:#777;font-size:12px">Your bag is empty. Add a piece from the collection.</div>'}
 else wrap.innerHTML=cart.map(c=>{const p=products().find(x=>x.id===c.id);if(!p)return '';total+=p.price*c.qty;count+=c.qty;return `<div class="cart-row"><div class="cart-thumb">${p.image?`<img src="${p.image}" alt="">`:''}</div><div><h4>${p.name}</h4><small>${money(p.price)} • ${p.category}</small><div class="qty"><button onclick="changeQty(${p.id},-1)">−</button><span>${c.qty}</span><button onclick="changeQty(${p.id},1)">+</button></div></div><b>${money(p.price*c.qty)}</b></div>`}).join('');
 document.getElementById('cartTotal').textContent=money(total);document.getElementById('cartCount').textContent=count;
}
function changeQty(id,d){const x=cart.find(c=>c.id===id);if(!x)return;x.qty+=d;if(x.qty<=0)cart=cart.filter(c=>c.id!==id);localStorage.setItem(CART,JSON.stringify(cart));renderCart()}
function openCart(){document.getElementById('cartDrawer').classList.add('open');document.getElementById('drawerOverlay').hidden=false}
function closeCart(){document.getElementById('cartDrawer').classList.remove('open');document.getElementById('drawerOverlay').hidden=true}
document.getElementById('cartBtn').onclick=openCart;document.getElementById('closeCart').onclick=closeCart;document.getElementById('drawerOverlay').onclick=closeCart;
document.getElementById('clearCart').onclick=()=>{cart=[];localStorage.setItem(CART,'[]');renderCart()};
document.getElementById('whatsappOrder').onclick=()=>{
 if(!cart.length)return alert('Your bag is empty.');
 const lines=cart.map(c=>{const p=products().find(x=>x.id===c.id);return `• ${p.name} x${c.qty} — ${money(p.price*c.qty)}`}).join('\n');
 const total=cart.reduce((s,c)=>{const p=products().find(x=>x.id===c.id);return s+p.price*c.qty},0);
 window.open('https://wa.me/254799281744?text='+encodeURIComponent(`Hello Outfits with Perez & Qhasukhu 👋\nI'd like to order:\n${lines}\n\nEstimated total: ${money(total)}\nPlease confirm availability, sizing and delivery.`),'_blank');
};
window.quickView=quickView;window.closeModal=closeModal;window.addCart=addCart;window.changeQty=changeQty;
(async()=>{await loadCatalog();render()})();
