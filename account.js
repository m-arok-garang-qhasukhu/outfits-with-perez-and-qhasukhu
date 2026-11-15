const $=id=>document.getElementById(id);
const supa=()=>window.OPQ_CLOUD?.ready&&window.OPQ_SUPABASE?window.OPQ_SUPABASE:null;
let mode='signin';
const labels={pending:'Pending review',confirmed:'Confirmed',awaiting_payment:'Awaiting payment',in_progress:'In progress / tailoring',ready:'Ready for collection',out_for_delivery:'Out for delivery',delivered:'Delivered',cancelled:'Cancelled'};
const money=n=>'KSh '+Number(n||0).toLocaleString('en-KE');
function setMode(next){mode=next;$('authHeading').textContent=mode==='signup'?'Create your account':'Sign in to your account';$('authSubmit').textContent=mode==='signup'?'Create account':'Sign in';$('toggleMode').textContent=mode==='signup'?'I already have an account':'Create an account';$('nameWrap').classList.toggle('hidden',mode!=='signup');$('password').autocomplete=mode==='signup'?'new-password':'current-password';}
$('toggleMode').onclick=()=>setMode(mode==='signin'?'signup':'signin');
// Customer-only password visibility control. The admin sign-in form is intentionally unchanged.
$('togglePasswordVisibility').onclick=()=>{const field=$('password'),button=$('togglePasswordVisibility');const reveal=field.type==='password';field.type=reveal?'text':'password';button.setAttribute('aria-pressed',String(reveal));button.setAttribute('aria-label',reveal?'Hide password':'Show password');button.title=reveal?'Hide password':'Show password';button.textContent=reveal?'🙈':'👁️';};
$('authForm').onsubmit=async e=>{e.preventDefault();const db=supa();if(!db){$('authMessage').textContent='The store connection is unavailable. Please try again later.';return}
 const email=$('email').value.trim(),password=$('password').value;
 $('authSubmit').disabled=true;$('authMessage').textContent='Please wait…';
 try{
  if(mode==='signup'){
   const name=$('fullName').value.trim();if(name.length<2)throw new Error('Please enter your full name.');
   const redirectTo=new URL('https://outfits-with-perez-and-qhasukhu.vercel.app/account.html');redirectTo.searchParams.set('auth','confirmed');const {data,error}=await db.auth.signUp({email,password,options:{data:{full_name:name},emailRedirectTo:redirectTo.toString()}});if(error)throw error;
   if(data.session){const p=new URLSearchParams(location.search);if(p.get('return')==='checkout'){location.href='index.html?checkout=1';return}$('authMessage').textContent='Account created. Loading your orders…';await loadAccount()}
   else $('authMessage').textContent='Account created. Check your email to confirm your address, then sign in.';
  }else{
   const {error}=await db.auth.signInWithPassword({email,password});if(error)throw error;
   const p=new URLSearchParams(location.search);if(p.get('return')==='checkout'){location.href='index.html?checkout=1';return}
   await loadAccount();
  }
 }catch(err){$('authMessage').textContent=err.message||'Could not authenticate.'}
 finally{$('authSubmit').disabled=false}
};
async function loadAccount(){
 const db=supa();if(!db)return;
 const {data:{session},error:sessionError}=await db.auth.getSession();if(sessionError)throw sessionError;
 if(!session){$('authCard').classList.remove('hidden');$('ordersCard').classList.add('hidden');return}
 $('authCard').classList.add('hidden');$('ordersCard').classList.remove('hidden');$('ordersMessage').textContent='Loading your orders…';
 const {data:orders,error}=await db.from('orders').select('id,customer_name,status,payment_status,total_kes,created_at,cancellation_status,cancellation_admin_note,order_items(id,product_id,product_name,quantity,size,unit_price_kes)').order('created_at',{ascending:false}).limit(100);
 if(error){$('ordersMessage').textContent='Could not load your orders: '+error.message;return}
 if(!orders.length){$('ordersMessage').textContent='No orders are linked to this account yet.';$('ordersList').innerHTML='';await loadTailoring(db);return}
 $('ordersMessage').textContent=`${orders.length} order${orders.length===1?'':'s'} found.`;
 $('ordersList').innerHTML=orders.map(o=>{const ref=String(o.id).slice(0,8).toUpperCase();const stage=labels[o.status]||String(o.status).replaceAll('_',' ');const items=(o.order_items||[]).map(i=>`${escapeHtml(i.product_name)}${i.size?' · Size '+escapeHtml(i.size):''} × ${i.quantity} — ${money(i.unit_price_kes*i.quantity)}`).join('<br>')||'Items unavailable';return `<article class="account-order"><div class="order-top"><strong>Order #${ref}</strong><span class="order-stage">${escapeHtml(stage)}</span></div><p class="muted">Placed ${new Date(o.created_at).toLocaleString()} · Payment: ${escapeHtml(o.payment_status)}</p><div class="order-items">${items}</div><p><strong>Total: ${money(o.total_kes)}</strong></p>${['pending','confirmed','awaiting_payment'].includes(o.status)&&!['requested','approved'].includes(o.cancellation_status)?`<button class="btn" type="button" onclick="requestCancellation('${o.id}')">Request cancellation</button>`:''}${o.cancellation_status==='requested'?`<p class="muted">Cancellation request pending admin review. <button type="button" onclick="withdrawCancellation('${o.id}')">Withdraw request</button></p>`:''}${o.cancellation_status==='rejected'?`<p class="muted">Cancellation request declined: ${escapeHtml(o.cancellation_admin_note||'Please contact support.')}</p>`:''}${o.cancellation_status==='approved'?`<p class="muted">Cancellation approved. Any refund or deposit return is handled separately.</p>`:''}${['in_progress','processing','ready','out_for_delivery'].includes(o.status)?`<p class="muted">For a cancellation or change at this stage, please contact support for an individual review.</p>`:''}${(o.status==='delivered'?(o.order_items||[]).map(i=>`<div class="review-form"><label>Review ${escapeHtml(i.product_name)} <select id="rating-${i.id}"><option value=5>5 stars</option><option value=4>4 stars</option><option value=3>3 stars</option><option value=2>2 stars</option><option value=1>1 star</option></select></label><textarea id="review-${i.id}" rows=2 placeholder="Share your experience (5–1200 characters)"></textarea><button type="button" onclick="submitReview('${i.id}')">Submit verified review</button></div>`).join(''):'')}</article>`}).join('');
 await loadTailoring(db);
}
function escapeHtml(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
$('signOut').onclick=async()=>{const db=supa();if(db)await db.auth.signOut();$('ordersCard').classList.add('hidden');$('authCard').classList.remove('hidden');$('authMessage').textContent='You have signed out.'};
(async()=>{const db=supa();if(!db){$('authMessage').textContent='Store connection unavailable. Please contact the store.';return}
 await loadAccount();
 db.auth.onAuthStateChange((_event,session)=>{if(session)setTimeout(()=>loadAccount(),0);else{$('ordersCard').classList.add('hidden');$('authCard').classList.remove('hidden')}});
 const params=new URLSearchParams(location.search);if(params.get('auth')==='confirmed'){const {data:{session:confirmedSession}}=await db.auth.getSession();if(confirmedSession){$('ordersMessage').textContent='Email confirmed successfully. Your account is ready.';}else{$('authMessage').textContent='Your email has been confirmed. Please sign in to continue.';}}if(params.get('return')==='checkout')$('authMessage').textContent='Sign in or create an account to continue checkout. After signing in, return to your bag and submit your order.';
})();

const statusText={submitted:'Submitted',under_review:'Under review',awaiting_measurements:'Awaiting measurements',quoted:'Quoted',approved:'Approved',deposit_pending:'Deposit pending',in_progress:'In progress',ready:'Ready',completed:'Completed',declined:'Declined'};
async function loadTailoring(db=supa()){
 if(!db)return;const box=$('tailoringList');if(!box)return;
 const {data,error}=await db.from('tailoring_requests').select('id,reference_code,garment_type,country,status,deposit_status,created_at,admin_note').order('created_at',{ascending:false}).limit(50);
 if(error){box.textContent='Could not load tailoring requests: '+error.message;return;}
 box.innerHTML=data.length?data.map(r=>`<article class="account-order"><b>${escapeHtml(r.reference_code)} · ${escapeHtml(r.garment_type)}</b><p class="muted">${escapeHtml(r.country)} · ${statusText[r.status]||escapeHtml(r.status)} · Deposit: ${escapeHtml(r.deposit_status)} (30% / balance 70%)</p>${r.admin_note?`<p class="muted">Store note: ${escapeHtml(r.admin_note)}</p>`:''}</article>`).join(''):'No tailoring requests yet.';
}
$('tailoringForm')?.addEventListener('submit',async e=>{
 e.preventDefault();const db=supa(),btn=$('tailorSubmit'),msg=$('tailorMessage');if(!db){msg.textContent='Store connection unavailable.';return;}
 btn.disabled=true;msg.textContent='Submitting…';
 try{
  let imageUrl='';const file=$('tailorImage').files[0];
  if(file){if(file.size>6*1024*1024)throw new Error('Please use an image smaller than 6 MB.');if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Use a JPG, PNG or WebP image.');
   const {data:{session}}=await db.auth.getSession();const path=`${session.user.id}/${crypto.randomUUID()}.${file.type.split('/')[1]}`;
   const {error}=await db.storage.from('tailoring-references').upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;imageUrl=path;
  }
  const {data,error}=await db.rpc('submit_tailoring_request',{p_garment_type:$('tailorGarment').value,p_fabric:$('tailorFabric').value.trim(),p_colour:$('tailorColour').value.trim(),p_style_preferences:$('tailorStyle').value.trim(),p_measurements:$('tailorMeasurements').value.trim(),p_reference_image_url:imageUrl,p_special_instructions:$('tailorNotes').value.trim(),p_desired_completion_date:$('tailorDate').value||null,p_country:$('tailorCountry').value});if(error)throw error;
  msg.textContent=`Request submitted. Your reference is ${data.reference_code}. The team will review it before confirming price, timing or deposit.`;$('tailoringForm').reset();await loadTailoring(db);
 }catch(err){msg.textContent='Could not submit request: '+err.message;}finally{btn.disabled=false;}
});
window.requestCancellation=async id=>{const reason=prompt('Why would you like to cancel this order?');if(reason===null)return;try{const {error}=await supa().rpc('request_order_cancellation',{p_order_id:id,p_reason:reason});if(error)throw error;await loadAccount();}catch(e){alert(e.message)}};
window.withdrawCancellation=async id=>{try{const {error}=await supa().rpc('withdraw_order_cancellation',{p_order_id:id});if(error)throw error;await loadAccount();}catch(e){alert(e.message)}};
window.submitReview=async id=>{try{const rating=Number($('rating-'+id).value),review=$('review-'+id).value;const {error}=await supa().rpc('submit_verified_product_review',{p_order_item_id:id,p_rating:rating,p_review_text:review});if(error)throw error;alert('Review submitted for admin moderation. Thank you!');$('review-'+id).disabled=true;}catch(e){alert(e.message)}};
