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
   if(!error && Array.isArray(data)){catalog=data.map(x=>({id:x.id,name:x.name,price:x.price_kes,category:x.category,sizes:(x.sizes||[]).join(','),description:x.description||'',new:!!x.is_new,featured:!!x.featured,image:x.image_url||'',available:x.available!==false}));return true}
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
 <div class="product-image">${x.image?`<img src="${x.image}" alt="${x.name}">`:`<div class="placeholder">${x.category==='Men'?'M':'W'}</div>`}${x.new?'<span class="badge">NEW</span>':''}<button class="quick" onclick='quickView(${JSON.stringify(String(x.id))})'>QUICK VIEW</button></div>
 <div class="product-info"><h3>${x.name}</h3><div class="product-meta"><span>${x.category}</span><span class="price">${money(x.price)}</span></div></div></article>`).join('');
 empty.hidden=!!p.length; renderCart();
}
document.querySelectorAll('.filter').forEach(b=>b.onclick=()=>{document.querySelectorAll('.filter').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.filter=b.dataset.filter;render()});
document.querySelectorAll('.category-tile').forEach(b=>b.onclick=()=>{document.querySelector(`[data-filter="${b.dataset.category}"]`).click();document.getElementById('shop').scrollIntoView()});
document.getElementById('searchInput').oninput=e=>{state.search=e.target.value;render()};
document.getElementById('menuBtn').onclick=()=>document.getElementById('mainNav').classList.toggle('open');

function quickView(id){
 const p=products().find(x=>String(x.id)===String(id)); if(!p)return;
 const sizes=(p.sizes||'').split(',').map(s=>s.trim()).filter(Boolean);selectedProductSize=sizes[0]||'';
 document.getElementById('productModal').innerHTML=`<button class="modal-close" onclick="closeModal()">×</button><div class="modal-photo">${p.image?`<img src="${p.image}" alt="${p.name}">`:`<div class="placeholder">P/Q</div>`}</div><div class="modal-copy"><p class="eyebrow">${p.category}${p.new?' • NEW':''}</p><h2>${p.name}</h2><h3>${money(p.price)}</h3><p>${p.description||'Beautifully tailored for your Sunday look.'}</p><strong style="font-size:10px;letter-spacing:.1em">SELECT SIZE</strong><div class="size-row">${sizes.map((s,i)=>`<button type="button" class="${i===0?'selected':''}" data-size="${s}" onclick="selectSize(this)">${s}</button>`).join('')}</div><div class="modal-actions"><button class="btn btn-dark" onclick='addSelectedToCart(${JSON.stringify(String(p.id))})'>Add to bag</button><a class="btn" style="border:1px solid #ddd" target="_blank" href="https://wa.me/254799281744?text=${encodeURIComponent('Hello, I am interested in '+p.name+' at '+money(p.price)+'.')}">Ask on WhatsApp</a></div></div>`;
 document.getElementById('modalBackdrop').hidden=false;
}
let selectedProductSize='';
function selectSize(button){button.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('selected'));button.classList.add('selected');selectedProductSize=button.dataset.size||''}
function addSelectedToCart(id){const modal=document.getElementById('productModal');const sizeBtn=modal.querySelector('.size-row button.selected');const size=sizeBtn?.dataset.size||'';addCart(id,1,size);closeModal()}
function closeModal(){document.getElementById('modalBackdrop').hidden=true}
document.getElementById('modalBackdrop').onclick=e=>{if(e.target.id==='modalBackdrop')closeModal()};

function addCart(id,qty=1,size=''){id=String(id);const found=cart.find(x=>String(x.id)===id&&String(x.size||'')===String(size||''));if(found)found.qty+=qty;else cart.push({id,qty,size:size||''});localStorage.setItem(CART,JSON.stringify(cart));renderCart();openCart()}
function renderCart(){
 const wrap=document.getElementById('cartItems');let total=0,count=0;
 if(!cart.length){wrap.innerHTML='<div style="padding:35px 24px;color:#777;font-size:12px">Your bag is empty. Add a piece from the collection.</div>'}
 else wrap.innerHTML=cart.map(c=>{const p=products().find(x=>String(x.id)===String(c.id));if(!p)return `<div class="cart-row"><div><strong>Item unavailable</strong><small>This item may have been removed from the catalogue.</small></div><button onclick='removeCartItem(${JSON.stringify(String(c.id))},${JSON.stringify(String(c.size||''))})'>Remove</button></div>`;total+=p.price*c.qty;count+=c.qty;return `<div class="cart-row"><div class="cart-thumb">${p.image?`<img src="${p.image}" alt="">`:''}</div><div><h4>${p.name}</h4><small>${money(p.price)} • ${p.category}${c.size?` • Size ${c.size}`:''}</small><div class="qty"><button onclick='changeQty(${JSON.stringify(String(p.id))},-1)'>−</button><span>${c.qty}</span><button onclick='changeQty(${JSON.stringify(String(p.id))},1)'>+</button></div></div><b>${money(p.price*c.qty)}</b></div>`}).join('');
 document.getElementById('cartTotal').textContent=money(total);document.getElementById('cartCount').textContent=count;
}
function removeCartItem(id,size=''){cart=cart.filter(c=>!(String(c.id)===String(id)&&String(c.size||'')===String(size||'')));localStorage.setItem(CART,JSON.stringify(cart));renderCart()}
function changeQty(id,d){const x=cart.find(c=>String(c.id)===String(id));if(!x)return;x.qty+=d;if(x.qty<=0)cart=cart.filter(c=>String(c.id)!==String(id)||String(c.size||'')!==String(x.size||''));localStorage.setItem(CART,JSON.stringify(cart));renderCart()}
function openCart(){document.getElementById('cartDrawer').classList.add('open');document.getElementById('drawerOverlay').hidden=false}
function closeCart(){document.getElementById('cartDrawer').classList.remove('open');document.getElementById('drawerOverlay').hidden=true}
document.getElementById('cartBtn').onclick=openCart;document.getElementById('closeCart').onclick=closeCart;document.getElementById('drawerOverlay').onclick=closeCart;
document.getElementById('clearCart').onclick=()=>{cart=[];localStorage.setItem(CART,'[]');renderCart()};
const checkoutForm=document.getElementById('checkoutForm');
document.getElementById('checkoutStart').onclick=()=>{
 if(!cart.length){alert('Your bag is empty.');return;}
 if(!window.OPQ_CLOUD?.ready||!window.OPQ_SUPABASE){alert('Online order submission is not configured yet. Please contact us on WhatsApp while the store setup is completed.');return;}
 checkoutForm.hidden=false;document.getElementById('checkoutStart').hidden=true;document.getElementById('checkoutMessage').textContent='';
};
document.getElementById('checkoutCancel').onclick=()=>{checkoutForm.hidden=true;document.getElementById('checkoutStart').hidden=false};
checkoutForm.onsubmit=async e=>{
 e.preventDefault(); const btn=document.getElementById('submitOrder'),msg=document.getElementById('checkoutMessage');
 if(!cart.length){msg.textContent='Your bag is empty.';return;}
 const items=cart.map(c=>({product_id:String(c.id),quantity:Number(c.qty),size:String(c.size||'')}));
 btn.disabled=true;btn.textContent='Submitting order…';msg.textContent='';
 try{
   const payload={p_customer_name:document.getElementById('checkoutName').value.trim(),p_phone:document.getElementById('checkoutPhone').value.trim(),p_delivery_address:document.getElementById('checkoutAddress').value.trim(),p_notes:document.getElementById('checkoutNotes').value.trim(),p_items:items};
   const {data,error}=await window.OPQ_SUPABASE.rpc('create_store_order',payload); if(error)throw error;
   const orderId=typeof data==='string'?data:(data?.order_id||data?.id||data?.[0]?.order_id);
   if(!orderId)throw new Error('The order may have been received, but no order reference was returned. Please contact us before submitting again.');
   const orderRef=String(orderId).slice(0,8).toUpperCase();
   const msgText=`Hello Outfits with Perez & Qhasukhu 👋\nI submitted website order #${orderRef}. Please confirm payment instructions and delivery.\nName: ${payload.p_customer_name}\nPhone: ${payload.p_phone}`;
   cart=[];localStorage.setItem(CART,'[]');renderCart();checkoutForm.reset();checkoutForm.hidden=true;document.getElementById('checkoutStart').hidden=false;
   msg.textContent='';alert(`Order submitted successfully! Reference: ${orderRef}. We will now open WhatsApp so you can coordinate payment.`);
   closeCart();window.open('https://wa.me/254799281744?text='+encodeURIComponent(msgText),'_blank');
 }catch(err){console.error(err);msg.textContent='Order was not submitted: '+(err.message||'Please try again or contact us on WhatsApp.');}
 finally{btn.disabled=false;btn.textContent='Submit order';}
};
window.quickView=quickView;window.closeModal=closeModal;window.addCart=addCart;window.changeQty=changeQty;window.selectSize=selectSize;window.addSelectedToCart=addSelectedToCart;window.removeCartItem=removeCartItem;
(async()=>{await loadCatalog();render()})();
