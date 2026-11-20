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
  // Fail closed: the admin dashboard must never fall back to local-only mode.
  if(!cloud()) return false;
  const {data:{session:s}}=await window.OPQ_SUPABASE.auth.getSession();
  session=s;
  if(!s) return false;
  const {data,error}=await window.OPQ_SUPABASE.from('admin_users').select('user_id').eq('user_id',s.user.id).maybeSingle();
  if(error) console.warn(error);
  return !!data;
}

function normalizeProductSizes(value){return Array.isArray(value)?value.map(v=>String(v).trim()).filter(Boolean).join(','):String(value||'').trim()}
async function getProducts(){
  if(!cloud()) return get();
  const pageSize=500,rows=[];
  for(let from=0;;from+=pageSize){
    const {data,error}=await window.OPQ_SUPABASE.from('products').select('*').order('created_at',{ascending:false}).range(from,from+pageSize-1);
    if(error){console.error(error);alert('Could not load products: '+error.message);return []}
    rows.push(...(data||[]));
    if(!data||data.length<pageSize)break;
  }
  return rows.map(x=>({id:x.id,name:x.name,price:x.price_kes,category:x.category,sizes:normalizeProductSizes(x.sizes),description:x.description||'',image:x.image_url||'',new:x.is_new,featured:x.featured,available:x.available,stockQuantity:x.stock_quantity,lowStockThreshold:x.low_stock_threshold}));
}

let productAdminPage=1;
const productAdminPageSize=25;
async function render(){
 const p=await getProducts(),term=($('productQuickSearch')?.value||'').trim().toLowerCase();
 const filtered=p.filter(x=>!term||[x.name,x.category,x.sizes,x.description,String(x.price),x.available?'available':'unavailable'].some(v=>String(v||'').toLowerCase().includes(term)));
 const totalPages=Math.max(1,Math.ceil(filtered.length/productAdminPageSize));productAdminPage=Math.min(Math.max(1,productAdminPage),totalPages);
 const start=(productAdminPage-1)*productAdminPageSize,visible=filtered.slice(start,start+productAdminPageSize);
 $('count').textContent=term?'('+filtered.length+' matching / '+p.length+' total)':'('+p.length+' total)';
 $('rows').innerHTML=visible.map(x=>{
 const image=x.image?'<img class="admin-thumb" src="'+esc(x.image)+'" alt="">':'—';
 const inventory=x.stockQuantity===null||x.stockQuantity===undefined?'<span class="status">Not tracked</span>':x.stockQuantity===0?'<span class="status unavailable">Out of stock</span>':x.stockQuantity<=Number(x.lowStockThreshold??3)?'<span class="status unavailable">Low: '+x.stockQuantity+'</span>':'<span class="status available">'+x.stockQuantity+' in stock</span>';
 return '<tr><td>'+image+'</td><td><b>'+esc(x.name)+'</b><br><small>'+(x.new?'New • ':'')+esc(x.sizes||'Custom sizing')+'</small></td><td>'+esc(x.category)+'</td><td>'+money(x.price)+'</td><td><span class="status '+(x.available!==false?'available':'unavailable')+'">'+(x.available!==false?'Available':'Unavailable')+'</span></td><td>'+inventory+'</td><td><div class="actions"><button onclick="edit(\''+String(x.id)+'\')">Edit</button><button class="danger" onclick="removeProduct(\''+String(x.id)+'\')">Delete</button></div></td></tr>';
 }).join('')||'<tr><td colspan="7">No products match your search.</td></tr>';
 renderProductAdminPagination(totalPages,filtered.length,start,visible.length);
 await renderOrders();await renderTailoring();await renderCancellations();await renderReviews()
}
function renderProductAdminPagination(totalPages,total,start,shown){
 const host=$('productAdminPagination');if(!host)return;
 $('productPageSummary').textContent=total?'Showing '+(start+1)+'–'+(start+shown)+' of '+total:'No products to display';
 if(totalPages<=1){host.innerHTML='';host.hidden=true;return;}host.hidden=false;
 const button=(label,page,disabled,current)=>'<button type="button" class="product-admin-page '+(current?'active':'')+'" data-page="'+page+'" '+(disabled?'disabled':'')+'>' +label+'</button>';
 const pages=[];for(let n=1;n<=totalPages;n++)if(n===1||n===totalPages||Math.abs(n-productAdminPage)<=1)pages.push(n);
 let markup=button('Previous',productAdminPage-1,productAdminPage===1,false),previous=0;
 for(const n of pages){if(previous&&n-previous>1)markup+='<span aria-hidden="true">…</span>';markup+=button(String(n),n,false,n===productAdminPage);previous=n;}
 markup+=button('Next',productAdminPage+1,productAdminPage===totalPages,false);host.innerHTML=markup;
 host.querySelectorAll('button[data-page]').forEach(b=>b.addEventListener('click',()=>{productAdminPage=Number(b.dataset.page);render();$('productsPanel').scrollIntoView({behavior:'smooth',block:'start'})}));
}

const orderStatusOptions=['pending','confirmed','awaiting_payment','in_progress','processing','ready','out_for_delivery','delivered','cancelled','paid'];
const titleCase=s=>String(s||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
async function renderOrders(){
 if(!cloud())return;
 const tbody=$('orderRows'); if(!tbody)return;
 $('ordersMessage').textContent='Loading orders…';
 const {data:orders,error}=await window.OPQ_SUPABASE.from('orders').select('id,customer_name,phone,delivery_address,notes,status,payment_status,total_kes,created_at,archived_at,cancellation_status,cancellation_reason,cancellation_admin_note,order_items(product_name,quantity,size,unit_price_kes)').order('created_at',{ascending:false}).limit(150);
 if(error){$('ordersMessage').textContent='Could not load orders: '+error.message;return}
 const active=orders.filter(o=>!o.archived_at),archived=orders.filter(o=>o.archived_at);
 const statusFilter=$('orderStatusFilter')?.value||'all',paymentFilter=$('orderPaymentFilter')?.value||'all',term=($('orderQuickSearch')?.value||'').trim().toLowerCase();
 const visible=active.filter(o=>(statusFilter==='all'||o.status===statusFilter)&&(paymentFilter==='all'||o.payment_status===paymentFilter)&&(!term||[o.id,o.customer_name,o.phone,o.delivery_address].some(v=>String(v||'').toLowerCase().includes(term))));
 $('orderCount').textContent='('+visible.length+' shown / '+active.length+' active)';
 tbody.innerHTML=visible.map(o=>{
  const items=(o.order_items||[]).map(i=>`${esc(i.product_name)}${i.size?' · '+esc(i.size):''} × ${i.quantity}`).join('<br>')||'—';
  const canArchive=['delivered','cancelled'].includes(o.status);
  return `<tr><td><b>${esc(String(o.id).slice(0,8).toUpperCase())}</b><br><small>${new Date(o.created_at).toLocaleString()}</small></td><td><b>${esc(o.customer_name)}</b><br><small>${esc(o.phone)}</small><br><small>${esc(o.delivery_address||'')}</small>${o.notes?`<br><small>Note: ${esc(o.notes)}</small>`:''}</td><td>${items}</td><td>${money(o.total_kes)}</td><td><select aria-label="Payment status" id="pay-${esc(o.id)}">${['unpaid','pending','paid','failed','refunded'].map(v=>`<option value="${v}" ${o.payment_status===v?'selected':''}>${titleCase(v)}</option>`).join('')}</select></td><td><select aria-label="Order status" id="status-${esc(o.id)}">${orderStatusOptions.map(v=>`<option value="${v}" ${o.status===v?'selected':''}>${titleCase(v)}</option>`).join('')}</select></td><td><button type="button" onclick="updateOrder('${esc(o.id)}')">Save</button>${canArchive?`<br><button type="button" class="archive-action" onclick="archiveOrderAdmin('${esc(o.id)}')">Archive</button>`:''}</td></tr>`;
 }).join('')||'<tr><td colspan="7">No active customer orders.</td></tr>';
 const archivedRows=$('archivedOrderRows');
 if(archivedRows) archivedRows.innerHTML=archived.map(o=>`<tr><td><b>${esc(String(o.id).slice(0,8).toUpperCase())}</b><br><small>${new Date(o.created_at).toLocaleDateString()}</small></td><td>${esc(o.customer_name)}<br><small>${esc(o.phone)}</small></td><td>${titleCase(o.status)}</td><td>${new Date(o.archived_at).toLocaleString()}</td><td><button type="button" onclick="restoreOrderAdmin('${esc(o.id)}')">Restore</button></td></tr>`).join('')||'<tr><td colspan="5">No archived orders.</td></tr>';
 $('ordersMessage').textContent=visible.length+' order(s) match your filters; '+active.length+' active and '+archived.length+' archived. Only Delivered or Cancelled orders can be archived.';
}
window.archiveOrderAdmin=async id=>{try{const {error}=await window.OPQ_SUPABASE.from('orders').update({archived_at:new Date().toISOString()}).eq('id',id).in('status',['delivered','cancelled']).is('archived_at',null);if(error)throw error;await renderOrders();}catch(e){$('ordersMessage').textContent='Could not archive order: '+e.message}};
window.restoreOrderAdmin=async id=>{try{const {error}=await window.OPQ_SUPABASE.from('orders').update({archived_at:null}).eq('id',id);if(error)throw error;await renderOrders();}catch(e){$('ordersMessage').textContent='Could not restore order: '+e.message}};
async function updateOrder(id){
 try{
  const status=$('status-'+id).value,payment_status=$('pay-'+id).value;
  const {data:before}=await window.OPQ_SUPABASE.from('orders').select('customer_name,phone').eq('id',id).maybeSingle();
  const {error}=await window.OPQ_SUPABASE.from('orders').update({status,payment_status}).eq('id',id);if(error)throw error;
  $('ordersMessage').textContent='Order updated. Preparing a WhatsApp status message…';
  await renderOrders();
  if(before?.phone){
   const stage=titleCase(status),ref=String(id).slice(0,8).toUpperCase();
   const body=`Hello ${before.customer_name}, an update from Outfits with Perez & Qhasukhu: your order #${ref} is now ${stage}. Payment status: ${titleCase(payment_status)}. You can track your order at ${location.origin}/account.html`;
   const phone=String(before.phone).replace(/[^0-9]/g,'').replace(/^0/,'254');
   window.open(`https://wa.me/${phone}?text=${encodeURIComponent(body)}`,'_blank','noopener');
   $('ordersMessage').textContent='Order updated. A WhatsApp message draft has opened; review and send it to the customer.';
  }
 }catch(e){$('ordersMessage').textContent='Could not update order: '+e.message}
}
$('refreshOrders')?.addEventListener('click',async()=>{await renderOrders();await renderTailoring();await renderCancellations();await renderReviews()});window.updateOrder=updateOrder;

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
  const payload={name:item.name,slug:item.name.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'-'+crypto.randomUUID().slice(0,8),price_kes:item.price,category:item.category,sizes:item.sizes?item.sizes.split(',').map(x=>x.trim()).filter(Boolean):[],description:item.description,image_url:item.image||null,available:item.available,is_new:item.new,featured:item.featured,stock_quantity:item.stockQuantity,low_stock_threshold:item.lowStockThreshold};
  if(existingId){
    const {error}=await window.OPQ_SUPABASE.from('products').update(payload).eq('id',existingId);if(error)throw error;
  }else{const {error}=await window.OPQ_SUPABASE.from('products').insert(payload);if(error)throw error;}
}

$('image').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{currentImage=r.result;$('preview').src=currentImage;$('preview').style.display='block'};r.readAsDataURL(f)};
$('productForm').onsubmit=async e=>{e.preventDefault();try{const id=$('productId').value;const file=$('image').files[0];let image=currentImage;if(file)image=await uploadImage(file);await saveProduct({name:$('name').value.trim(),price:Number($('price').value),category:$('category').value,sizes:$('sizes').value.trim(),description:$('description').value.trim(),image,new:$('new').checked,featured:$('featured').checked,available:$('available').checked,stockQuantity:$('stockQuantity').value===''?null:Number($('stockQuantity').value),lowStockThreshold:Number($('lowStockThreshold').value||3)},id);reset();await render();alert('Product saved successfully.')}catch(err){console.error(err);alert('Could not save product: '+err.message)}};

async function edit(id){const p=await getProducts();const x=p.find(a=>String(a.id)===String(id));if(!x)return;$('productId').value=x.id;$('name').value=x.name;$('price').value=x.price;$('category').value=x.category;$('sizes').value=x.sizes||'';$('description').value=x.description||'';$('available').checked=x.available!==false;$('stockQuantity').value=x.stockQuantity===null||x.stockQuantity===undefined?'':x.stockQuantity;$('lowStockThreshold').value=x.lowStockThreshold??3;$('new').checked=!!x.new;$('featured').checked=!!x.featured;currentImage=x.image||'';$('preview').src=currentImage;$('preview').style.display=currentImage?'block':'none';$('formTitle').textContent='Edit product';$('saveBtn').textContent='Update product';window.scrollTo({top:0,behavior:'smooth'})}
async function removeProduct(id){if(!confirm('Delete this product?'))return;try{if(cloud()){const {error}=await window.OPQ_SUPABASE.from('products').delete().eq('id',id);if(error)throw error}else save(get().filter(x=>String(x.id)!==String(id)));await render();await refreshDashboardOverview();setDefaultReportDates();await refreshBusinessReport()}catch(err){alert('Could not delete product: '+err.message)}}
function reset(){$('productForm').reset();$('productId').value='';currentImage='';$('preview').style.display='none';$('formTitle').textContent='Add a product';$('saveBtn').textContent='Save product'}
$('cancelBtn').onclick=reset;
window.edit=edit;window.removeProduct=removeProduct;

const tailoringStages=['submitted','under_review','awaiting_measurements','quoted','approved','deposit_pending','in_progress','ready','completed','delivered','declined'];
let tailoringObjectUrls=[];
let tailoringAdminPage=1;
const tailoringAdminPageSize=20;
function tailoringDetail(label,value,full=false){
 const content=value===null||value===undefined||String(value).trim()===''?'Not provided':String(value);
 return '<div class="tailor-detail'+(full?' full':'')+'"><b>'+esc(label)+'</b><span>'+esc(content)+'</span></div>';
}
function tailoringMeasurements(raw){
 if(raw===null||raw===undefined||String(raw).trim()==='')return tailoringDetail('Body measurements','Not provided',true);
 let parsed=null;
 if(typeof raw==='object')parsed=raw;
 else {try{parsed=JSON.parse(raw)}catch(_){}}
 if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)){
  const entries=Object.entries(parsed).filter(([,v])=>v!==null&&v!==undefined&&String(v).trim()!=='');
  if(entries.length)return '<div class="tailor-detail full"><b>Body measurements</b><div class="tailor-measurements">'+entries.map(([k,v])=>'<div class="tailor-measurement"><strong>'+esc(titleCase(k.replaceAll('_',' ')))+':</strong> '+esc(v)+'</div>').join('')+'</div></div>';
 }
 return tailoringDetail('Body measurements',String(raw),true);
}
async function renderTailoring(){
 if(!cloud()||!$('tailoringRows'))return;
 tailoringObjectUrls.forEach(url=>URL.revokeObjectURL(url));
 tailoringObjectUrls=[];
 const data=[];const pageSize=500;
 for(let from=0;;from+=pageSize){const {data:batch,error}=await window.OPQ_SUPABASE.from('tailoring_requests').select('*').order('created_at',{ascending:false}).range(from,from+pageSize-1);if(error){$('tailoringAdminMessage').textContent='Could not load tailoring requests: '+error.message;return;}data.push(...(batch||[]));if(!batch||batch.length<pageSize)break;}
 const active=data.filter(r=>!r.archived_at),archived=data.filter(r=>r.archived_at);
 const statusFilter=$('tailoringStatusFilter')?.value||'all',depositFilter=$('tailoringDepositFilter')?.value||'all',term=($('tailoringQuickSearch')?.value||'').trim().toLowerCase();
 const visible=active.filter(r=>(statusFilter==='all'||r.status===statusFilter)&&(depositFilter==='all'||r.deposit_status===depositFilter)&&(!term||[r.reference_code,r.customer_name,r.customer_email,r.customer_phone,r.garment_type,r.fabric,r.colour,r.desired_completion_date].some(v=>String(v||'').toLowerCase().includes(term))));
 const totalPages=Math.max(1,Math.ceil(visible.length/tailoringAdminPageSize));tailoringAdminPage=Math.min(Math.max(1,tailoringAdminPage),totalPages);
 const pageStart=(tailoringAdminPage-1)*tailoringAdminPageSize,pageRows=visible.slice(pageStart,pageStart+tailoringAdminPageSize);
 const count=$('tailoringCount');if(count)count.textContent=visible.length+' matching / '+active.length+' active';
 const html=await Promise.all(pageRows.map(async r=>{
  let preview='';
  if(r.reference_image_url){
   const {data:file,error:e}=await window.OPQ_SUPABASE.storage.from('tailoring-references').download(r.reference_image_url);
   if(!e&&file){
    const localUrl=URL.createObjectURL(file);tailoringObjectUrls.push(localUrl);
    preview='<a target="_blank" rel="noopener" href="'+esc(localUrl)+'"><img class="tailor-reference-image" src="'+esc(localUrl)+'" alt="Customer reference image"></a><small>Private customer reference image</small>';
   }else{console.warn('Could not load private tailoring reference image:',e);preview='<small>Private image saved; preview could not be loaded. Check storage access.</small>';}
  }
  const customer='<div class="tailor-customer"><strong>'+esc(r.customer_name||'Name not supplied')+'</strong><span>'+esc(r.customer_email||'Email unavailable')+'</span><span>'+esc(r.customer_phone||'Phone unavailable')+'</span><span>'+esc(r.country||'Country not supplied')+'</span></div>';
  const details='<div class="tailor-details">'+tailoringDetail('Garment',r.garment_type)+tailoringDetail('Fabric',r.fabric)+tailoringDetail('Colour',r.colour)+tailoringDetail('Preferred completion',r.desired_completion_date?new Date(r.desired_completion_date+'T00:00:00').toLocaleDateString():'Not specified')+tailoringDetail('Style preferences',r.style_preferences,true)+tailoringMeasurements(r.measurements)+tailoringDetail('Special instructions',r.special_instructions,true)+(preview?'<div class="tailor-detail full"><b>Reference image</b>'+preview+'</div>':'')+'</div>';
  const dueDate=r.desired_completion_date?new Date(r.desired_completion_date+'T00:00:00'):null;const daysLeft=dueDate?Math.ceil((dueDate.getTime()-new Date().setHours(0,0,0,0))/86400000):null;const dueFlag=dueDate&&!['completed','delivered','declined'].includes(r.status)?(daysLeft<0?'<br><span class="due-flag overdue">OVERDUE · '+Math.abs(daysLeft)+' day(s)</span>':daysLeft<=3?'<br><span class="due-flag soon">'+(daysLeft===0?'DUE TODAY':'DUE IN '+daysLeft+' DAY(S)')+'</span>':''):'';const ref='<b>'+esc(r.reference_code)+'</b><br><span>'+new Date(r.created_at).toLocaleString()+'</span>'+dueFlag+(r.customer_updated_at?'<br><strong style="color:#8a6500">Customer corrected · '+new Date(r.customer_updated_at).toLocaleString()+'</strong>':'');
   const workflow='<div class="tailor-workflow"><label>Status</label><select id="tailor-status-'+r.id+'">'+tailoringStages.map(x=>'<option value="'+x+'" '+(x===r.status?'selected':'')+'>'+titleCase(x)+'</option>').join('')+'</select><label>Agreed quotation (KES)</label><input id="tailor-quote-'+r.id+'" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Enter agreed total" value="'+(r.quoted_amount_kes===null||r.quoted_amount_kes===undefined?'':esc(r.quoted_amount_kes))+'"><label>Deposit status</label><select id="tailor-deposit-'+r.id+'">'+['unpaid','pending','paid'].map(x=>'<option value="'+x+'" '+(x===r.deposit_status?'selected':'')+'>'+titleCase(x)+'</option>').join('')+'</select><small>Deposit / balance: '+esc(r.deposit_percent??30)+'% / '+esc(r.balance_percent??70)+'%. Set status to Quoted when ready to notify the customer.</small></div>';
  const messages='<div class="tailor-workflow"><label>Private admin note</label><textarea id="tailor-note-'+r.id+'" rows="3" placeholder="Internal notes…">'+esc(r.admin_note||'')+'</textarea><label>Message to customer</label><textarea id="tailor-message-'+r.id+'" rows="4" placeholder="Write the message the customer should see…">'+esc(r.customer_message||'')+'</textarea><small>'+(r.customer_message_sent_at?'Last sent: '+new Date(r.customer_message_sent_at).toLocaleString():'Not yet sent')+'</small><br><button type="button" onclick="sendTailoringWhatsApp(\''+r.id+'\')">Save & open WhatsApp</button> <button type="button" onclick="markTailoringMessageSent(\''+r.id+'\')">'+(r.customer_message_sent_at?'Mark sent again':'Mark as sent')+'</button></div>';
  return '<tr class="tailoring-request-row"><td>'+ref+'</td><td>'+customer+'</td><td>'+details+'</td><td>'+workflow+'</td><td>'+messages+'</td><td class="tailor-actions"><button onclick="saveTailoring(\''+r.id+'\')">Save request</button>'+(['completed','delivered'].includes(r.status)?'<br><button class="archive-action" onclick="archiveTailoringAdmin(\''+r.id+'\')">Archive request</button>':'')+'</td></tr>';
 }));
 $('tailoringRows').innerHTML=html.join('');
 renderTailoringAdminPagination(totalPages,visible.length,pageStart,pageRows.length);
 const archivedRows=$('archivedTailoringRows');
 if(archivedRows) archivedRows.innerHTML=archived.map(r=>'<tr><td><b>'+esc(r.reference_code)+'</b></td><td>'+esc(r.customer_name||'')+'</td><td>'+esc(r.garment_type)+'</td><td>'+new Date(r.archived_at).toLocaleString()+'</td><td><button onclick="restoreTailoringRequest(\''+r.id+'\')">Restore to active</button></td></tr>').join('')||'<tr><td colspan="5">No archived requests.</td></tr>';
 $('tailoringAdminMessage').textContent=active.length+' active request(s); '+archived.length+' archived. All records are loaded in batches; use search and pages to find older requests. Archive completed or delivered requests only.';
}
function renderTailoringAdminPagination(totalPages,total,start,shown){
 const host=$('tailoringAdminPagination'),summary=$('tailoringPageSummary');if(!host)return;
 if(summary)summary.textContent=total?'Showing '+(start+1)+'–'+(start+shown)+' of '+total+' matching requests':'No requests match these filters';
 if(totalPages<=1){host.innerHTML='';host.hidden=true;return;}host.hidden=false;
 const button=(label,page,disabled,current)=>'<button type="button" class="tailoring-admin-page '+(current?'active':'')+'" data-tailoring-page="'+page+'" '+(disabled?'disabled':'')+'>'+label+'</button>';
 const pages=[];for(let n=1;n<=totalPages;n++)if(n===1||n===totalPages||Math.abs(n-tailoringAdminPage)<=1)pages.push(n);
 let markup=button('Previous',tailoringAdminPage-1,tailoringAdminPage===1,false),previous=0;
 for(const n of pages){if(previous&&n-previous>1)markup+='<span aria-hidden="true">…</span>';markup+=button(String(n),n,false,n===tailoringAdminPage);previous=n;}
 markup+=button('Next',tailoringAdminPage+1,tailoringAdminPage===totalPages,false);host.innerHTML=markup;
 host.querySelectorAll('button[data-tailoring-page]').forEach(b=>b.addEventListener('click',()=>{tailoringAdminPage=Number(b.dataset.tailoringPage);renderTailoring();$('tailoringPanel').scrollIntoView({behavior:'smooth',block:'start'});}));
}
window.saveTailoring=async id=>{try{const status=$('tailor-status-'+id).value,rawQuote=$('tailor-quote-'+id).value.trim();const quote=rawQuote===''?null:Number(rawQuote);if(quote!==null&&(!Number.isFinite(quote)||quote<0))throw new Error('Enter a valid quotation amount of zero or more.');const {error}=await window.OPQ_SUPABASE.from('tailoring_requests').update({status,quoted_amount_kes:quote,deposit_status:$('tailor-deposit-'+id).value,admin_note:$('tailor-note-'+id).value.trim(),customer_message:$('tailor-message-'+id).value.trim(),customer_message_sent_at:null}).eq('id',id);if(error)throw error;$('tailoringAdminMessage').textContent='Tailoring request, quotation and message draft saved. Set status to Quoted when the quotation is ready to notify the customer.';await renderTailoring();}catch(e){$('tailoringAdminMessage').textContent='Could not update: '+e.message}};
window.archiveTailoringAdmin=async id=>{try{const {error}=await window.OPQ_SUPABASE.from('tailoring_requests').update({archived_at:new Date().toISOString()}).eq('id',id).in('status',['completed','delivered']).is('archived_at',null);if(error)throw error;await renderTailoring();}catch(e){$('tailoringAdminMessage').textContent='Could not archive: '+e.message}};
window.restoreTailoringRequest=async id=>{try{const {error}=await window.OPQ_SUPABASE.from('tailoring_requests').update({archived_at:null}).eq('id',id);if(error)throw error;await renderTailoring();}catch(e){$('tailoringAdminMessage').textContent='Could not restore: '+e.message}};
window.sendTailoringWhatsApp=async id=>{const popup=window.open('about:blank','_blank');try{const message=$('tailor-message-'+id).value.trim();if(!message)throw new Error('Write a customer message first.');const {data:r,error:readError}=await window.OPQ_SUPABASE.from('tailoring_requests').select('customer_phone,customer_name,reference_code').eq('id',id).single();if(readError)throw readError;let phone=String(r.customer_phone||'').replace(/\D/g,'');if(phone.startsWith('0'))phone='254'+phone.slice(1);if(phone.startsWith('7')||phone.startsWith('1'))phone='254'+phone;if(!phone)throw new Error('Customer phone number is missing.');const rawQuote=$('tailor-quote-'+id).value.trim(),quote=rawQuote===''?null:Number(rawQuote);if(quote!==null&&(!Number.isFinite(quote)||quote<0))throw new Error('Enter a valid quotation amount of zero or more.');const {error}=await window.OPQ_SUPABASE.from('tailoring_requests').update({status:$('tailor-status-'+id).value,quoted_amount_kes:quote,deposit_status:$('tailor-deposit-'+id).value,admin_note:$('tailor-note-'+id).value.trim(),customer_message:message,customer_message_sent_at:null}).eq('id',id);if(error)throw error;const full='Hello '+(r.customer_name||'')+'\nReference: '+r.reference_code+'\n\n'+message;const url='https://wa.me/'+phone+'?text='+encodeURIComponent(full);if(popup)popup.location.href=url;else window.location.href=url;$('tailoringAdminMessage').textContent='Message draft saved. WhatsApp opened; review and press Send there. Then return and mark it sent.';}catch(e){if(popup)popup.close();$('tailoringAdminMessage').textContent='Could not prepare WhatsApp: '+e.message}};
window.markTailoringMessageSent=async id=>{try{const message=$('tailor-message-'+id).value.trim();if(!message)throw new Error('Save a message before marking it sent.');const {error}=await window.OPQ_SUPABASE.from('tailoring_requests').update({customer_message:message,customer_message_sent_at:new Date().toISOString()}).eq('id',id);if(error)throw error;$('tailoringAdminMessage').textContent='Marked as sent. The customer can now see this message in their account.';await renderTailoring();}catch(e){$('tailoringAdminMessage').textContent='Could not mark message sent: '+e.message}};
async function renderCancellations(){if(!cloud()||!$('cancellationRows'))return;const {data,error}=await window.OPQ_SUPABASE.from('orders').select('id,customer_name,phone,status,cancellation_status,cancellation_reason,cancellation_admin_note').neq('cancellation_status','none').order('cancellation_requested_at',{ascending:false}).limit(100);if(error){$('cancellationAdminMessage').textContent=error.message;return;} $('cancellationRows').innerHTML=data.map(o=>`<tr><td>${String(o.id).slice(0,8).toUpperCase()}</td><td>${esc(o.customer_name)}<br><small>${esc(o.phone)}</small></td><td>${esc(o.cancellation_reason||'—')}</td><td><select id="cancel-status-${o.id}">${['requested','approved','rejected','withdrawn'].map(x=>`<option value="${x}" ${x===o.cancellation_status?'selected':''}>${titleCase(x)}</option>`).join('')}</select></td><td><textarea id="cancel-note-${o.id}" rows="2">${esc(o.cancellation_admin_note||'')}</textarea></td><td><button onclick="saveCancellation('${o.id}')">Save</button></td></tr>`).join('');$('cancellationAdminMessage').textContent=`${data.length} cancellation record(s).`}
window.saveCancellation=async id=>{try{const decision=$('cancel-status-'+id).value;const {error}=await window.OPQ_SUPABASE.from('orders').update({cancellation_status:decision,cancellation_admin_note:$('cancel-note-'+id).value.trim(),cancellation_reviewed_at:new Date().toISOString(),...(decision==='approved'?{status:'cancelled'}:{})}).eq('id',id);if(error)throw error;await renderCancellations();$('cancellationAdminMessage').textContent='Cancellation decision saved. Payment/refund status was not changed.';}catch(e){$('cancellationAdminMessage').textContent='Could not save decision: '+e.message}};
async function renderReviews(){if(!cloud()||!$('reviewRows'))return;const {data,error}=await window.OPQ_SUPABASE.from('product_reviews').select('id,product_id,order_item_id,tailoring_request_id,reviewer_name,rating,review_text,is_approved,created_at,products(name),tailoring_requests(reference_code,garment_type)').order('created_at',{ascending:false}).limit(150);if(error){$('reviewAdminMessage').textContent='Could not load reviews: '+error.message;return;} $('reviewRows').innerHTML=data.map(r=>{const subject=r.products?.name||(r.tailoring_requests?'Custom tailoring · '+r.tailoring_requests.garment_type+' ('+r.tailoring_requests.reference_code+')':'Review');return `<tr><td>${esc(subject)}</td><td>${r.rating}/5</td><td><b>${esc(r.reviewer_name)}</b><br>${esc(r.review_text)}</td><td>${r.is_approved?'Approved':'Pending'}</td><td><button onclick="moderateReview('${r.id}',${!r.is_approved})">${r.is_approved?'Unpublish':'Approve'}</button></td></tr>`}).join('')||'<tr><td colspan="5">No reviews submitted yet.</td></tr>';$('reviewAdminMessage').textContent=`${data.length} review(s).`}
window.moderateReview=async(id,approved)=>{try{const {error}=await window.OPQ_SUPABASE.from('product_reviews').update({is_approved:approved}).eq('id',id);if(error)throw error;await renderReviews();}catch(e){$('reviewAdminMessage').textContent='Could not moderate review: '+e.message}};

let businessReportOrders=[];
function reportDateBounds(){
 const start=$('reportStartDate')?.value||'0000-01-01';
 const end=$('reportEndDate')?.value||'9999-12-31';
 return {start,end};
}


function renderBusinessCharts(orders){
 const revenueEl=$('reportRevenueChart'),statusEl=$('reportStatusChart'),paymentEl=$('reportPaymentChart');
 if(!revenueEl||!statusEl||!paymentEl)return;
 const outstandingStatuses=['unpaid','pending','failed'];
 const monthMap=new Map();
 orders.forEach(o=>{
  const month=String(o.created_at||'').slice(0,7);if(!/^[0-9]{4}-[0-9]{2}$/.test(month))return;
  if(!monthMap.has(month))monthMap.set(month,{paid:0,outstanding:0});
  const row=monthMap.get(month),amount=Number(o.total_kes||0);
  if(o.payment_status==='paid')row.paid+=amount;
  else if(outstandingStatuses.includes(String(o.payment_status||'').toLowerCase()))row.outstanding+=amount;
 });
 const months=[...monthMap.entries()].sort((a,b)=>a[0].localeCompare(b[0])).slice(-12);
 const labelMonth=key=>new Date(key+'-01T12:00:00').toLocaleDateString(undefined,{month:'short',year:'2-digit'});
 const svgEsc=value=>esc(String(value));
 function moneyAxis(value){const n=Number(value)||0;if(n>=1000000)return 'KSh '+(n/1000000).toFixed(1)+'m';if(n>=1000)return 'KSh '+(n/1000).toFixed(0)+'k';return 'KSh '+Math.round(n);}
 function drawColumnChart(el,series,aria){
  if(!series.length){el.innerHTML='<div class="report-chart-empty">No payment data in this date range.</div>';return;}
  const w=720,h=270,left=82,right=18,top=18,bottom=58,plotW=w-left-right,plotH=h-top-bottom;
  const maxValue=Math.max(1,...series.flatMap(x=>x.values)),axisMax=Math.ceil(maxValue/4)*4||1,tick=axisMax/4;
  let grid='';
  for(let n=0;n<=4;n++){const value=tick*n,y=top+plotH-(value/axisMax)*plotH;grid+='<line x1="'+left+'" y1="'+y+'" x2="'+(w-right)+'" y2="'+y+'" stroke="#e7edf4" stroke-width="1"/><text x="'+(left-10)+'" y="'+(y+4)+'" text-anchor="end" font-size="10" fill="#64748b">'+svgEsc(moneyAxis(value))+'</text>';}
  const groupW=plotW/series.length,barGap=series.length>8?4:8,barW=Math.min(34,(groupW-barGap*2)/series[0].values.length);
  let bars='',labels='';
  series.forEach((item,i)=>{
   const center=left+groupW*(i+.5),totalWidth=barW*item.values.length+barGap*(item.values.length-1),base=center-totalWidth/2;
   item.values.forEach((value,j)=>{const bh=value/axisMax*plotH,x=base+j*(barW+barGap),y=top+plotH-bh;bars+='<g><title>'+svgEsc(item.label+': '+labelMonth(item.key)+' — '+money(value))+'</title><rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+Math.max(0,bh).toFixed(1)+'" rx="3" fill="'+item.colors[j]+'"/></g>';});
   labels+='<text x="'+center.toFixed(1)+'" y="'+(h-29)+'" text-anchor="middle" font-size="11" fill="#475569">'+svgEsc(labelMonth(item.key))+'</text>';
  });
  el.innerHTML='<svg viewBox="0 0 '+w+' '+h+'" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="'+svgEsc(aria)+'">'+grid+'<line x1="'+left+'" y1="'+(top+plotH)+'" x2="'+(w-right)+'" y2="'+(top+plotH)+'" stroke="#94a3b8"/>'+bars+labels+'</svg>';
 }
 const revenueSeries=months.map(([key,v])=>({key,label:'Paid revenue',values:[v.paid],colors:['#142b4a']}));
 drawColumnChart(revenueEl,revenueSeries,'Paid revenue by month, with value axis and gridlines');
 if(months.length)revenueEl.insertAdjacentHTML('beforeend','<div class="report-chart-legend"><span><i style="background:#142b4a"></i>Paid revenue</span></div>');
 else revenueEl.innerHTML='<div class="report-chart-empty">No paid revenue in this date range.</div>';
 const counts=new Map();orders.forEach(o=>{const key=String(o.status||'unknown');counts.set(key,(counts.get(key)||0)+1);});
 const statuses=[...counts.entries()].sort((a,b)=>b[1]-a[1]);
 if(!statuses.length)statusEl.innerHTML='<div class="report-chart-empty">No orders in this date range.</div>';
 else{
  const w=720,row=42,left=150,right=42,barW=w-left-right,h=Math.max(120,statuses.length*row+24),max=Math.max(...statuses.map(x=>x[1]),1),axisMax=Math.ceil(max/4)*4||1;
  let grid='',bars='';
  for(let n=0;n<=4;n++){const x=left+barW*n/4;grid+='<line x1="'+x+'" y1="8" x2="'+x+'" y2="'+(h-16)+'" stroke="#e7edf4"/><text x="'+x+'" y="'+(h-2)+'" text-anchor="middle" font-size="10" fill="#64748b">'+Math.round(axisMax*n/4)+'</text>';}
  statuses.forEach(([name,count],i)=>{const y=14+i*row,width=count/axisMax*barW;bars+='<g><title>'+svgEsc(titleCase(name)+': '+count+' orders')+'</title><text x="'+(left-12)+'" y="'+(y+18)+'" text-anchor="end" font-size="12" fill="#344054">'+svgEsc(titleCase(name))+'</text><rect x="'+left+'" y="'+y+'" width="'+barW+'" height="22" rx="5" fill="#f1e8e2"/><rect x="'+left+'" y="'+y+'" width="'+width.toFixed(1)+'" height="22" rx="5" fill="#76243d"/><text x="'+(left+width+8)+'" y="'+(y+16)+'" font-size="11" fill="#344054">'+count+'</text></g>';});
  statusEl.innerHTML='<svg viewBox="0 0 '+w+' '+h+'" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Order status distribution horizontal bar chart">'+grid+bars+'</svg>';
 }
 const paymentSeries=months.map(([key,v])=>({key,label:'Payments',values:[v.paid,v.outstanding],colors:['#142b4a','#76243d']}));
 drawColumnChart(paymentEl,paymentSeries,'Monthly paid revenue compared with outstanding payments');
 if(months.length)paymentEl.insertAdjacentHTML('beforeend','<div class="report-chart-legend"><span><i style="background:#142b4a"></i>Paid revenue</span><span><i style="background:#76243d"></i>Outstanding</span></div>');
 else paymentEl.innerHTML='<div class="report-chart-empty">No payment data in this date range.</div>';
}

async function refreshBusinessReport(){
 if(!cloud())return;
 const message=$('businessReportMessage');if(message)message.textContent='Preparing report…';
 try{
  const [ordersResult,tailoringResult]=await Promise.all([
   window.OPQ_SUPABASE.from('orders').select('id,customer_name,status,payment_status,total_kes,created_at,archived_at').order('created_at',{ascending:false}).limit(500),
   window.OPQ_SUPABASE.from('tailoring_requests').select('status,created_at').order('created_at',{ascending:false}).limit(500)
  ]);
  if(ordersResult.error)throw ordersResult.error;if(tailoringResult.error)throw tailoringResult.error;
  const {start,end}=reportDateBounds();
  if(start>end)throw new Error('The start date must be on or before the end date.');
  const inRange=row=>{const date=String(row.created_at||'').slice(0,10);return date>=start&&date<=end;};
  businessReportOrders=(ordersResult.data||[]).filter(inRange);
  renderBusinessCharts(businessReportOrders);
  const tailoring=(tailoringResult.data||[]).filter(inRange);
  const paid=businessReportOrders.filter(o=>o.payment_status==='paid');
  const outstanding=businessReportOrders.filter(o=>['unpaid','pending','failed'].includes(o.payment_status));
  const sum=rows=>rows.reduce((total,row)=>total+Number(row.total_kes||0),0);
  $('reportOrderCount').textContent=businessReportOrders.length;
  $('reportPaidRevenue').textContent=money(sum(paid));
  $('reportOutstanding').textContent=money(sum(outstanding));
  $('reportAverageOrder').textContent=money(businessReportOrders.length?sum(businessReportOrders)/businessReportOrders.length:0);
  $('reportCompletedTailoring').textContent=tailoring.filter(r=>['completed','delivered'].includes(r.status)).length;
  if(message)message.textContent='Report covers '+start+' to '+end+'. '+businessReportOrders.length+' orders and '+tailoring.length+' tailoring requests included. Data is limited to the latest 500 records in each list.';
 }catch(e){if(message)message.textContent='Could not prepare report: '+e.message;console.warn(e);}
}
function exportBusinessReportCsv(){
 if(!businessReportOrders.length){$('businessReportMessage').textContent='There are no orders in this date range to export.';return;}
 const cell=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
 const rows=[['Order reference','Date','Customer','Order status','Payment status','Total (KSh)'],...businessReportOrders.map(o=>[String(o.id).slice(0,8).toUpperCase(),new Date(o.created_at).toLocaleString(),o.customer_name,o.status,o.payment_status,Number(o.total_kes||0)])];
 const csv=rows.map(row=>row.map(cell).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
 const link=document.createElement('a');link.href=url;link.download='pq-orders-report-'+reportDateBounds().start+'-to-'+reportDateBounds().end+'.csv';document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
}
function setDefaultReportDates(){
 const now=new Date(),today=now.toISOString().slice(0,10),monthStart=new Date(now.getFullYear(),now.getMonth(),1).toISOString().slice(0,10);
 if($('reportStartDate')&&!$('reportStartDate').value)$('reportStartDate').value=monthStart;
 if($('reportEndDate')&&!$('reportEndDate').value)$('reportEndDate').value=today;
}
$('runBusinessReport')?.addEventListener('click',refreshBusinessReport);
$('exportBusinessReport')?.addEventListener('click',exportBusinessReportCsv);

async function refreshDashboardOverview(){if(!cloud())return;['kpiOrders','kpiRevenue','kpiTailoring','kpiReviews','kpiProducts'].forEach(id=>$(id).textContent='…');try{const [a,t,r,p]=await Promise.all([window.OPQ_SUPABASE.from('orders').select('status,payment_status,total_kes,archived_at').order('created_at',{ascending:false}).limit(500),window.OPQ_SUPABASE.from('tailoring_requests').select('status,archived_at').order('created_at',{ascending:false}).limit(500),window.OPQ_SUPABASE.from('product_reviews').select('is_approved').limit(500),window.OPQ_SUPABASE.from('products').select('id',{count:'exact',head:true})]);const err=[a,t,r,p].find(x=>x.error);if(err)throw err.error;const orders=a.data||[],tailoring=t.data||[],reviews=r.data||[];$('kpiOrders').textContent=orders.filter(x=>!x.archived_at).length;$('kpiRevenue').textContent=money(orders.filter(x=>x.payment_status==='paid').reduce((s,x)=>s+Number(x.total_kes||0),0));$('kpiTailoring').textContent=tailoring.filter(x=>!x.archived_at&&!['completed','delivered','declined'].includes(x.status)).length;$('kpiReviews').textContent=reviews.filter(x=>!x.is_approved).length;$('kpiProducts').textContent=p.count??'—';$('overviewUpdated').textContent='Updated '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})+'. Counts use the latest 500 records per list.';}catch(e){$('overviewUpdated').textContent='Summary could not be refreshed: '+e.message;console.warn(e)}}
async function init(){
  document.querySelectorAll('.admin-protected').forEach(el=>el.style.display='none');
  $('productForm').style.opacity='.45';
  $('productForm').style.pointerEvents='none';
  [...$('productForm').querySelectorAll('input,select,textarea,button')].forEach(el=>el.disabled=true);
  if(!cloud()){
    $('loginPanel').style.display='none';
    $('modeNote').innerHTML='<b>Connection unavailable:</b> Supabase configuration did not load. Product management is locked for safety. Check that supabase-config.js and supabase-client.js are in the repository root and redeploy.';
    $('authStatus').textContent='Cloud connection unavailable';
    return;
  }
  if(cloud()){
    $('modeNote').innerHTML='<b>Cloud mode:</b> Supabase is configured. Sign in with the admin account you created for this store.';
    $('loginPanel').style.display='block';
    const ok=await isAdmin();
    if(ok){document.querySelectorAll('.admin-protected').forEach(el=>el.style.display='block');$('loginPanel').style.display='none';$('authStatus').textContent=session?.user?.email||'Admin';$('logoutBtn').style.display='inline';$('productForm').style.opacity='1';$('productForm').style.pointerEvents='auto';[...$('productForm').querySelectorAll('input,select,textarea,button')].forEach(el=>el.disabled=false);await render();await refreshDashboardOverview();setDefaultReportDates();await refreshBusinessReport()}
    else {$('authStatus').textContent='Admin sign-in required';$('productForm').style.opacity='.45';$('productForm').style.pointerEvents='none';}
    window.OPQ_SUPABASE.auth.onAuthStateChange(async (_event,s)=>{session=s;const ok=await isAdmin();document.querySelectorAll('.admin-protected').forEach(el=>el.style.display=ok?'block':'none');$('loginPanel').style.display=ok?'none':'block';$('productForm').style.opacity=ok?'1':'.45';$('productForm').style.pointerEvents=ok?'auto':'none';[...$('productForm').querySelectorAll('input,select,textarea,button')].forEach(el=>el.disabled=!ok);$('logoutBtn').style.display=ok?'inline':'none';$('authStatus').textContent=ok?(s?.user?.email||'Admin'):'Admin sign-in required';if(ok){await render();await refreshDashboardOverview();setDefaultReportDates();await refreshBusinessReport()}});
  } else await render();
}
$('loginForm').onsubmit=async e=>{e.preventDefault();if(!cloud()){ $('loginMsg').textContent='Cloud connection unavailable. Please contact the site administrator.'; return; } const {error}=await window.OPQ_SUPABASE.auth.signInWithPassword({email:$('loginEmail').value.trim(),password:$('loginPassword').value});$('loginMsg').textContent=error?error.message:'Signed in. Checking admin access…'};
$('logoutBtn').onclick=()=>window.OPQ_SUPABASE.auth.signOut();$('refreshDashboard')?.addEventListener('click',refreshDashboardOverview);$('adminSearch')?.addEventListener('input',e=>{const q=e.target.value.trim().toLowerCase();document.querySelectorAll('.admin-table tbody tr').forEach(row=>{row.hidden=!!q&&!row.textContent.toLowerCase().includes(q)})});document.querySelectorAll('.admin-nav a').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('.admin-nav a').forEach(x=>x.classList.remove('active'));a.classList.add('active')}));
$('productQuickSearch')?.addEventListener('input',()=>{productAdminPage=1;render()});
init();

// Section-level filters keep the global dashboard search available as well.
['orderStatusFilter','orderPaymentFilter','orderQuickSearch'].forEach(id=>$(id)?.addEventListener(id==='orderQuickSearch'?'input':'change',()=>renderOrders()));
['tailoringStatusFilter','tailoringDepositFilter','tailoringQuickSearch'].forEach(id=>$(id)?.addEventListener(id==='tailoringQuickSearch'?'input':'change',()=>{tailoringAdminPage=1;renderTailoring()}));
