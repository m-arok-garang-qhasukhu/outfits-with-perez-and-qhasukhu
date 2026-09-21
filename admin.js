const KEY='opq_products_v3';
const seed=[
{id:1,name:"Men's 3-Piece Suit",price:8500,category:"Men",sizes:"S,M,L,XL,XXL",description:"A polished three-piece look designed for Sunday service, formal gatherings and special occasions.",new:true,featured:true,image:"",available:true},
{id:2,name:"Women's Church Dress",price:6500,category:"Women",sizes:"8,10,12,14,16,18",description:"An elegant church dress with a refined silhouette and comfortable finish.",new:true,featured:true,image:"",available:true},
{id:3,name:"Men's Classic Blazer",price:7000,category:"Men",sizes:"S,M,L,XL,XXL",description:"A versatile tailored blazer that works beautifully with formal trousers or a smart shirt.",new:false,featured:true,image:"",available:true},
{id:4,name:"Dress & Hat Set",price:7500,category:"Women",sizes:"8,10,12,14,16,18",description:"A coordinated Sunday set for a complete, graceful look.",new:true,featured:false,image:"",available:true},
{id:5,name:"Men's Formal Shirt",price:2000,category:"Men",sizes:"S,M,L,XL,XXL",description:"A crisp formal shirt for church, meetings and celebrations.",new:false,featured:false,image:"",available:true},
{id:6,name:"Women's Tailored Blazer",price:5500,category:"Women",sizes:"8,10,12,14,16,18",description:"A structured blazer that adds polish to dresses, skirts and trousers.",new:false,featured:false,image:"",available:true}
];
function get(){let p=JSON.parse(localStorage.getItem(KEY)||'null');if(!Array.isArray(p)){p=seed;save(p)}return p}
function save(p){localStorage.setItem(KEY,JSON.stringify(p))}
const money=n=>`KSh ${Number(n).toLocaleString('en-KE')}`;
let currentImage='';
const $=id=>document.getElementById(id);
const cloud=()=>!!(window.OPQ_CLOUD&&window.OPQ_CLOUD.ready&&window.OPQ_SUPABASE);
let session=null;

function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

async function isAdmin(){
  if(!cloud()) return true;
  const {data:{session:s}}=await window.OPQ_SUPABASE.auth.getSession();
  session=s;
  if(!s) return false;
  const {data,error}=await window.OPQ_SUPABASE.from('admin_users').select('user_id').eq('user_id',s.user.id).maybeSingle();
  if(error) console.warn(error);
  return !!data;
}

async function getProducts(){
  if(!cloud()) return get();
  const {data,error}=await window.OPQ_SUPABASE.from('products').select('*').order('created_at',{ascending:false});
  if(error){console.error(error);alert('Could not load products: '+error.message);return []}
  return data.map(x=>({id:x.id,name:x.name,price:x.price_kes,category:x.category,sizes:(x.sizes||[]).join(','),description:x.description||'',image:x.image_url||'',new:x.is_new,featured:x.featured,available:x.available}));
}

async function render(){
  const p=await getProducts();$('count').textContent=`(${p.length})`;
  $('rows').innerHTML=p.map(x=>`<tr><td>${x.image?`<img class="admin-thumb" src="${esc(x.image)}" alt="">`:'—'}</td><td><b>${esc(x.name)}</b><br><small>${x.new?'New • ':''}${esc(x.sizes||'Custom sizing')}</small></td><td>${esc(x.category)}</td><td>${money(x.price)}</td><td><span class="status ${x.available!==false?'available':'unavailable'}">${x.available!==false?'Available':'Unavailable'}</span></td><td><div class="actions"><button onclick="edit('${String(x.id)}')">Edit</button><button class="danger" onclick="removeProduct('${String(x.id)}')">Delete</button></div></td></tr>`).join('')}

async function uploadImage(file){
  if(!file)return '';
  if(!cloud()){return await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(file)})}
  if(file.size>6*1024*1024) throw new Error('Please keep product images under 6 MB for standard uploads.');
  const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
  const path=`products/${crypto.randomUUID()}.${ext}`;
  const {data,error}=await window.OPQ_SUPABASE.storage.from(window.OPQ_SUPABASE_CONFIG.imageBucket).upload(path,file,{contentType:file.type||'image/jpeg',upsert:false,cacheControl:'3600'});
  if(error)throw error;
  const {data:pub}=window.OPQ_SUPABASE.storage.from(window.OPQ_SUPABASE_CONFIG.imageBucket).getPublicUrl(data.path);
  return pub.publicUrl;
}

async function saveProduct(item, existingId){
  if(!cloud()){
    let p=get();
    if(existingId){const i=p.findIndex(x=>String(x.id)===String(existingId));if(i>=0){if(!item.image)item.image=p[i].image;p[i]={...p[i],...item,id:p[i].id}}}
    else p.push({...item,id:Date.now()});
    save(p);return;
  }
  const payload={name:item.name,slug:item.name.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'-'+crypto.randomUUID().slice(0,8),price_kes:item.price,category:item.category,sizes:item.sizes?item.sizes.split(',').map(x=>x.trim()).filter(Boolean):[],description:item.description,image_url:item.image||null,available:item.available,is_new:item.new,featured:item.featured};
  if(existingId){
    const {error}=await window.OPQ_SUPABASE.from('products').update(payload).eq('id',existingId);if(error)throw error;
  }else{const {error}=await window.OPQ_SUPABASE.from('products').insert(payload);if(error)throw error;}
}

$('image').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{currentImage=r.result;$('preview').src=currentImage;$('preview').style.display='block'};r.readAsDataURL(f)};
$('productForm').onsubmit=async e=>{e.preventDefault();try{const id=$('productId').value;const file=$('image').files[0];let image=currentImage;if(file)image=await uploadImage(file);await saveProduct({name:$('name').value.trim(),price:Number($('price').value),category:$('category').value,sizes:$('sizes').value.trim(),description:$('description').value.trim(),image,new:$('new').checked,featured:$('featured').checked,available:$('available').checked},id);reset();await render();alert('Product saved successfully.')}catch(err){console.error(err);alert('Could not save product: '+err.message)}};

async function edit(id){const p=await getProducts();const x=p.find(a=>String(a.id)===String(id));if(!x)return;$('productId').value=x.id;$('name').value=x.name;$('price').value=x.price;$('category').value=x.category;$('sizes').value=x.sizes||'';$('description').value=x.description||'';$('available').checked=x.available!==false;$('new').checked=!!x.new;$('featured').checked=!!x.featured;currentImage=x.image||'';$('preview').src=currentImage;$('preview').style.display=currentImage?'block':'none';$('formTitle').textContent='Edit product';$('saveBtn').textContent='Update product';window.scrollTo({top:0,behavior:'smooth'})}
async function removeProduct(id){if(!confirm('Delete this product?'))return;try{if(cloud()){const {error}=await window.OPQ_SUPABASE.from('products').delete().eq('id',id);if(error)throw error}else save(get().filter(x=>String(x.id)!==String(id)));await render()}catch(err){alert('Could not delete product: '+err.message)}}
function reset(){$('productForm').reset();$('productId').value='';currentImage='';$('preview').style.display='none';$('formTitle').textContent='Add a product';$('saveBtn').textContent='Save product'}
$('cancelBtn').onclick=reset;
window.edit=edit;window.removeProduct=removeProduct;

async function init(){
  if(cloud()){
    $('modeNote').innerHTML='<b>Cloud mode:</b> Supabase is configured. Sign in with the admin account you created for this store.';
    $('loginPanel').style.display='block';
    const ok=await isAdmin();
    if(ok){$('loginPanel').style.display='none';$('authStatus').textContent=session?.user?.email||'Admin';$('logoutBtn').style.display='inline';await render()}
    else {$('authStatus').textContent='Admin sign-in required';$('productForm').style.opacity='.45';$('productForm').style.pointerEvents='none';}
    window.OPQ_SUPABASE.auth.onAuthStateChange(async (_event,s)=>{session=s;const ok=await isAdmin();$('loginPanel').style.display=ok?'none':'block';$('productForm').style.opacity=ok?'1':'.45';$('productForm').style.pointerEvents=ok?'auto':'none';$('logoutBtn').style.display=ok?'inline':'none';$('authStatus').textContent=ok?(s?.user?.email||'Admin'):'Admin sign-in required';if(ok)await render()});
  } else await render();
}
$('loginForm').onsubmit=async e=>{e.preventDefault();const {error}=await window.OPQ_SUPABASE.auth.signInWithPassword({email:$('loginEmail').value.trim(),password:$('loginPassword').value});$('loginMsg').textContent=error?error.message:'Signed in. Checking admin access…'};
$('logoutBtn').onclick=()=>window.OPQ_SUPABASE.auth.signOut();
init();
