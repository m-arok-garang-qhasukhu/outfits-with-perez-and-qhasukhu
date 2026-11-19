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

async function getProducts(){
  if(!cloud()) return get();
  const {data,error}=await window.OPQ_SUPABASE.from('products').select('*').order('created_at',{ascending:false});
  if(error){console.error(error);alert('Could not load products: '+error.message);return []}
  return data.map(x=>({id:x.id,name:x.name,price:x.price_kes,category:x.category,sizes:(x.sizes||[]).join(','),description:x.description||'',image:x.image_url||'',new:x.is_new,featured:x.featured,available:x.available}));
}

async function render(){
  const p=await getProducts();$('count').textContent=`(${p.length})`;
  $('rows').innerHTML=p.map(x=>`<tr><td>${x.image?`<img class="admin-thumb" src="${esc(x.image)}" alt="">`:'—'}</td><td><b>${esc(x.name)}</b><br><small>${x.new?'New • ':''}${esc(x.sizes||'Custom sizing')}</small></td><td>${esc(x.category)}</td><td>${money(x.price)}</td><td><span class="status ${x.available!==false?'available':'unavailable'}">${x.available!==false?'Available':'Unavailable'}</span></td><td><div class="actions"><button onclick="edit('${String(x.id)}')">Edit</button><button class="danger" onclick="removeProduct('${String(x.id)}')">Delete</button></div></td></tr>`).join(''); await renderOrders();await renderTailoring();await renderCancellations();await renderReviews()}

const orderStatusOptions=['pending','confirmed','awaiting_payment','in_progress','processing','ready','out_for_delivery','delivered','cancelled','paid'];
const titleCase=s=>String(s||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
async function renderOrders(){
 if(!cloud())return;
 const tbody=$('orderRows'); if(!tbody)return;
 $('ordersMessage').textContent='Loading orders…';
 const {data:orders,error}=await window.OPQ_SUPABASE.from('orders').select('id,customer_name,phone,delivery_address,notes,status,payment_status,total_kes,created_at,archived_at,cancellation_status,cancellation_reason,cancellation_admin_note,order_items(product_name,quantity,size,unit_price_kes)').order('created_at',{ascending:false}).limit(150);
 if(error){$('ordersMessage').textContent='Could not load orders: '+error.message;return}
 const active=orders.filter(o=>!o.archived_at),archived=orders.filter(o=>o.archived_at);
 $('orderCount').textContent='('+active.length+' active)';
 tbody.innerHTML=active.map(o=>{
  const items=(o.order_items||[]).map(i=>`${esc(i.product_name)}${i.size?' · '+esc(i.size):''} × ${i.quantity}`).join('<br>')||'—';
  const canArchive=['delivered','cancelled'].includes(o.status);
  return `<tr><td><b>${esc(String(o.id).slice(0,8).toUpperCase())}</b><br><small>${new Date(o.created_at).toLocaleString()}</small></td><td><b>${esc(o.customer_name)}</b><br><small>${esc(o.phone)}</small><br><small>${esc(o.delivery_address||'')}</small>${o.notes?`<br><small>Note: ${esc(o.notes)}</small>`:''}</td><td>${items}</td><td>${money(o.total_kes)}</td><td><select aria-label="Payment status" id="pay-${esc(o.id)}">${['unpaid','pending','paid','failed','refunded'].map(v=>`<option value="${v}" ${o.payment_status===v?'selected':''}>${titleCase(v)}</option>`).join('')}</select></td><td><select aria-label="Order status" id="status-${esc(o.id)}">${orderStatusOptions.map(v=>`<option value="${v}" ${o.status===v?'selected':''}>${titleCase(v)}</option>`).join('')}</select></td><td><button type="button" onclick="updateOrder('${esc(o.id)}')">Save</button>${canArchive?`<br><button type="button" class="archive-action" onclick="archiveOrderAdmin('${esc(o.id)}')">Archive</button>`:''}</td></tr>`;
 }).join('')||'<tr><td colspan="7">No active customer orders.</td></tr>';
 const archivedRows=$('archivedOrderRows');
 if(archivedRows) archivedRows.innerHTML=archived.map(o=>`<tr><td><b>${esc(String(o.id).slice(0,8).toUpperCase())}</b><br><small>${new Date(o.created_at).toLocaleDateString()}</small></td><td>${esc(o.customer_name)}<br><small>${esc(o.phone)}</small></td><td>${titleCase(o.status)}</td><td>${new Date(o.archived_at).toLocaleString()}</td><td><button type="button" onclick="restoreOrderAdmin('${esc(o.id)}')">Restore</button></td></tr>`).join('')||'<tr><td colspan="5">No archived orders.</td></tr>';
 $('ordersMessage').textContent=active.length+' active order(s); '+archived.length+' archived. Only Delivered or Cancelled orders can be archived.';
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
  const payload={name:item.name,slug:item.name.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'-'+crypto.randomUUID().slice(0,8),price_kes:item.price,category:item.category,sizes:item.sizes?item.sizes.split(',').map(x=>x.trim()).filter(Boolean):[],description:item.description,image_url:item.image||null,available:item.available,is_new:item.new,featured:item.featured};
  if(existingId){
    const {error}=await window.OPQ_SUPABASE.from('products').update(payload).eq('id',existingId);if(error)throw error;
  }else{const {error}=await window.OPQ_SUPABASE.from('products').insert(payload);if(error)throw error;}
}

$('image').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{currentImage=r.result;$('preview').src=currentImage;$('preview').style.display='block'};r.readAsDataURL(f)};
$('productForm').onsubmit=async e=>{e.preventDefault();try{const id=$('productId').value;const file=$('image').files[0];let image=currentImage;if(file)image=await uploadImage(file);await saveProduct({name:$('name').value.trim(),price:Number($('price').value),category:$('category').value,sizes:$('sizes').value.trim(),description:$('description').value.trim(),image,new:$('new').checked,featured:$('featured').checked,available:$('available').checked},id);reset();await render();alert('Product saved successfully.')}catch(err){console.error(err);alert('Could not save product: '+err.message)}};

async function edit(id){const p=await getProducts();const x=p.find(a=>String(a.id)===String(id));if(!x)return;$('productId').value=x.id;$('name').value=x.name;$('price').value=x.price;$('category').value=x.category;$('sizes').value=x.sizes||'';$('description').value=x.description||'';$('available').checked=x.available!==false;$('new').checked=!!x.new;$('featured').checked=!!x.featured;currentImage=x.image||'';$('preview').src=currentImage;$('preview').style.display=currentImage?'block':'none';$('formTitle').textContent='Edit product';$('saveBtn').textContent='Update product';window.scrollTo({top:0,behavior:'smooth'})}
async function removeProduct(id){if(!confirm('Delete this product?'))return;try{if(cloud()){const {error}=await window.OPQ_SUPABASE.from('products').delete().eq('id',id);if(error)throw error}else save(get().filter(x=>String(x.id)!==String(id)));await render();await refreshDashboardOverview()}catch(err){alert('Could not delete product: '+err.message)}}
function reset(){$('productForm').reset();$('productId').value='';currentImage='';$('preview').style.display='none';$('formTitle').textContent='Add a product';$('saveBtn').textContent='Save product'}
$('cancelBtn').onclick=reset;
window.edit=edit;window.removeProduct=removeProduct;

const tailoringStages=['submitted','under_review','awaiting_measurements','quoted','approved','deposit_pending','in_progress','ready','completed','delivered','declined'];
let tailoringObjectUrls=[];
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
 const {data,error}=await window.OPQ_SUPABASE.from('tailoring_requests').select('*').order('created_at',{ascending:false}).limit(150);
 if(error){$('tailoringAdminMessage').textContent=error.message;return;}
 const active=data.filter(r=>!r.archived_at),archived=data.filter(r=>r.archived_at);
 const html=await Promise.all(active.map(async r=>{
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
  const ref='<b>'+esc(r.reference_code)+'</b><br><span>'+new Date(r.created_at).toLocaleString()+'</span>'+(r.customer_updated_at?'<br><strong style="color:#8a6500">Customer corrected · '+new Date(r.customer_updated_at).toLocaleString()+'</strong>':'');
  const workflow='<div class="tailor-workflow"><label>Status</label><select id="tailor-status-'+r.id+'">'+tailoringStages.map(x=>'<option value="'+x+'" '+(x===r.status?'selected':'')+'>'+titleCase(x)+'</option>').join('')+'</select><label>Deposit status</label><select id="tailor-deposit-'+r.id+'">'+['unpaid','pending','paid'].map(x=>'<option value="'+x+'" '+(x===r.deposit_status?'selected':'')+'>'+titleCase(x)+'</option>').join('')+'</select><small>Deposit / balance: '+esc(r.deposit_percent??30)+'% / '+esc(r.balance_percent??70)+'%</small></div>';
  const messages='<div class="tailor-workflow"><label>Private admin note</label><textarea id="tailor-note-'+r.id+'" rows="3" placeholder="Internal notes…">'+esc(r.admin_note||'')+'</textarea><label>Message to customer</label><textarea id="tailor-message-'+r.id+'" rows="4" placeholder="Write the message the customer should see…">'+esc(r.customer_message||'')+'</textarea><small>'+(r.customer_message_sent_at?'Last sent: '+new Date(r.customer_message_sent_at).toLocaleString():'Not yet sent')+'</small><br><button type="button" onclick="sendTailoringWhatsApp(\''+r.id+'\')">Save & open WhatsApp</button> <button type="button" onclick="markTailoringMessageSent(\''+r.id+'\')">'+(r.customer_message_sent_at?'Mark sent again':'Mark as sent')+'</button></div>';
  return '<tr class="tailoring-request-row"><td>'+ref+'</td><td>'+customer+'</td><td>'+details+'</td><td>'+workflow+'</td><td>'+messages+'</td><td class="tailor-actions"><button onclick="saveTailoring(\''+r.id+'\')">Save request</button>'+(['completed','delivered'].includes(r.status)?'<br><button class="archive-action" onclick="archiveTailoringAdmin(\''+r.id+'\')">Archive request</button>':'')+'</td></tr>';
 }));
 $('tailoringRows').innerHTML=html.join('');
 const archivedRows=$('archivedTailoringRows');
 if(archivedRows) archivedRows.innerHTML=archived.map(r=>'<tr><td><b>'+esc(r.reference_code)+'</b></td><td>'+esc(r.customer_name||'')+'</td><td>'+esc(r.garment_type)+'</td><td>'+new Date(r.archived_at).toLocaleString()+'</td><td><button onclick="restoreTailoringRequest(\''+r.id+'\')">Restore to active</button></td></tr>').join('')||'<tr><td colspan="5">No archived requests.</td></tr>';
 $('tailoringAdminMessage').textContent=active.length+' active request(s); '+archived.length+' archived. Customer details are now grouped into readable cards. Archive completed or delivered requests only.';
}
window.saveTailoring=async id=>{try{const status=$('tailor-status-'+id).value;const {error}=await window.OPQ_SUPABASE.from('tailoring_requests').update({status,deposit_status:$('tailor-deposit-'+id).value,admin_note:$('tailor-note-'+id).value.trim(),customer_message:$('tailor-message-'+id).value.trim(),customer_message_sent_at:null}).eq('id',id);if(error)throw error;$('tailoringAdminMessage').textContent='Tailoring request and message draft saved. The customer sees the message only after you mark it sent.';await renderTailoring();}catch(e){$('tailoringAdminMessage').textContent='Could not update: '+e.message}};
window.archiveTailoringAdmin=async id=>{try{const {error}=await window.OPQ_SUPABASE.from('tailoring_requests').update({archived_at:new Date().toISOString()}).eq('id',id).in('status',['completed','delivered']).is('archived_at',null);if(error)throw error;await renderTailoring();}catch(e){$('tailoringAdminMessage').textContent='Could not archive: '+e.message}};
window.restoreTailoringRequest=async id=>{try{const {error}=await window.OPQ_SUPABASE.from('tailoring_requests').update({archived_at:null}).eq('id',id);if(error)throw error;await renderTailoring();}catch(e){$('tailoringAdminMessage').textContent='Could not restore: '+e.message}};
window.sendTailoringWhatsApp=async id=>{const popup=window.open('about:blank','_blank');try{const message=$('tailor-message-'+id).value.trim();if(!message)throw new Error('Write a customer message first.');const {data:r,error:readError}=await window.OPQ_SUPABASE.from('tailoring_requests').select('customer_phone,customer_name,reference_code').eq('id',id).single();if(readError)throw readError;let phone=String(r.customer_phone||'').replace(/\D/g,'');if(phone.startsWith('0'))phone='254'+phone.slice(1);if(phone.startsWith('7')||phone.startsWith('1'))phone='254'+phone;if(!phone)throw new Error('Customer phone number is missing.');const {error}=await window.OPQ_SUPABASE.from('tailoring_requests').update({status:$('tailor-status-'+id).value,deposit_status:$('tailor-deposit-'+id).value,admin_note:$('tailor-note-'+id).value.trim(),customer_message:message,customer_message_sent_at:null}).eq('id',id);if(error)throw error;const full='Hello '+(r.customer_name||'')+'\nReference: '+r.reference_code+'\n\n'+message;const url='https://wa.me/'+phone+'?text='+encodeURIComponent(full);if(popup)popup.location.href=url;else window.location.href=url;$('tailoringAdminMessage').textContent='Message draft saved. WhatsApp opened; review and press Send there. Then return and mark it sent.';}catch(e){if(popup)popup.close();$('tailoringAdminMessage').textContent='Could not prepare WhatsApp: '+e.message}};
window.markTailoringMessageSent=async id=>{try{const message=$('tailor-message-'+id).value.trim();if(!message)throw new Error('Save a message before marking it sent.');const {error}=await window.OPQ_SUPABASE.from('tailoring_requests').update({customer_message:message,customer_message_sent_at:new Date().toISOString()}).eq('id',id);if(error)throw error;$('tailoringAdminMessage').textContent='Marked as sent. The customer can now see this message in their account.';await renderTailoring();}catch(e){$('tailoringAdminMessage').textContent='Could not mark message sent: '+e.message}};
async function renderCancellations(){if(!cloud()||!$('cancellationRows'))return;const {data,error}=await window.OPQ_SUPABASE.from('orders').select('id,customer_name,phone,status,cancellation_status,cancellation_reason,cancellation_admin_note').neq('cancellation_status','none').order('cancellation_requested_at',{ascending:false}).limit(100);if(error){$('cancellationAdminMessage').textContent=error.message;return;} $('cancellationRows').innerHTML=data.map(o=>`<tr><td>${String(o.id).slice(0,8).toUpperCase()}</td><td>${esc(o.customer_name)}<br><small>${esc(o.phone)}</small></td><td>${esc(o.cancellation_reason||'—')}</td><td><select id="cancel-status-${o.id}">${['requested','approved','rejected','withdrawn'].map(x=>`<option value="${x}" ${x===o.cancellation_status?'selected':''}>${titleCase(x)}</option>`).join('')}</select></td><td><textarea id="cancel-note-${o.id}" rows="2">${esc(o.cancellation_admin_note||'')}</textarea></td><td><button onclick="saveCancellation('${o.id}')">Save</button></td></tr>`).join('');$('cancellationAdminMessage').textContent=`${data.length} cancellation record(s).`}
window.saveCancellation=async id=>{try{const decision=$('cancel-status-'+id).value;const {error}=await window.OPQ_SUPABASE.from('orders').update({cancellation_status:decision,cancellation_admin_note:$('cancel-note-'+id).value.trim(),cancellation_reviewed_at:new Date().toISOString(),...(decision==='approved'?{status:'cancelled'}:{})}).eq('id',id);if(error)throw error;await renderCancellations();$('cancellationAdminMessage').textContent='Cancellation decision saved. Payment/refund status was not changed.';}catch(e){$('cancellationAdminMessage').textContent='Could not save decision: '+e.message}};
async function renderReviews(){if(!cloud()||!$('reviewRows'))return;const {data,error}=await window.OPQ_SUPABASE.from('product_reviews').select('id,product_id,order_item_id,tailoring_request_id,reviewer_name,rating,review_text,is_approved,created_at,products(name),tailoring_requests(reference_code,garment_type)').order('created_at',{ascending:false}).limit(150);if(error){$('reviewAdminMessage').textContent='Could not load reviews: '+error.message;return;} $('reviewRows').innerHTML=data.map(r=>{const subject=r.products?.name||(r.tailoring_requests?'Custom tailoring · '+r.tailoring_requests.garment_type+' ('+r.tailoring_requests.reference_code+')':'Review');return `<tr><td>${esc(subject)}</td><td>${r.rating}/5</td><td><b>${esc(r.reviewer_name)}</b><br>${esc(r.review_text)}</td><td>${r.is_approved?'Approved':'Pending'}</td><td><button onclick="moderateReview('${r.id}',${!r.is_approved})">${r.is_approved?'Unpublish':'Approve'}</button></td></tr>`}).join('')||'<tr><td colspan="5">No reviews submitted yet.</td></tr>';$('reviewAdminMessage').textContent=`${data.length} review(s).`}
window.moderateReview=async(id,approved)=>{try{const {error}=await window.OPQ_SUPABASE.from('product_reviews').update({is_approved:approved}).eq('id',id);if(error)throw error;await renderReviews();}catch(e){$('reviewAdminMessage').textContent='Could not moderate review: '+e.message}};
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
    if(ok){document.querySelectorAll('.admin-protected').forEach(el=>el.style.display='block');$('loginPanel').style.display='none';$('authStatus').textContent=session?.user?.email||'Admin';$('logoutBtn').style.display='inline';$('productForm').style.opacity='1';$('productForm').style.pointerEvents='auto';[...$('productForm').querySelectorAll('input,select,textarea,button')].forEach(el=>el.disabled=false);await render();await refreshDashboardOverview()}
    else {$('authStatus').textContent='Admin sign-in required';$('productForm').style.opacity='.45';$('productForm').style.pointerEvents='none';}
    window.OPQ_SUPABASE.auth.onAuthStateChange(async (_event,s)=>{session=s;const ok=await isAdmin();document.querySelectorAll('.admin-protected').forEach(el=>el.style.display=ok?'block':'none');$('loginPanel').style.display=ok?'none':'block';$('productForm').style.opacity=ok?'1':'.45';$('productForm').style.pointerEvents=ok?'auto':'none';[...$('productForm').querySelectorAll('input,select,textarea,button')].forEach(el=>el.disabled=!ok);$('logoutBtn').style.display=ok?'inline':'none';$('authStatus').textContent=ok?(s?.user?.email||'Admin'):'Admin sign-in required';if(ok){await render();await refreshDashboardOverview()}});
  } else await render();
}
$('loginForm').onsubmit=async e=>{e.preventDefault();if(!cloud()){ $('loginMsg').textContent='Cloud connection unavailable. Please contact the site administrator.'; return; } const {error}=await window.OPQ_SUPABASE.auth.signInWithPassword({email:$('loginEmail').value.trim(),password:$('loginPassword').value});$('loginMsg').textContent=error?error.message:'Signed in. Checking admin access…'};
$('logoutBtn').onclick=()=>window.OPQ_SUPABASE.auth.signOut();$('refreshDashboard')?.addEventListener('click',refreshDashboardOverview);$('adminSearch')?.addEventListener('input',e=>{const q=e.target.value.trim().toLowerCase();document.querySelectorAll('.admin-table tbody tr').forEach(row=>{row.hidden=!!q&&!row.textContent.toLowerCase().includes(q)})});document.querySelectorAll('.admin-nav a').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('.admin-nav a').forEach(x=>x.classList.remove('active'));a.classList.add('active')}));
init();
