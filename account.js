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
 const savedName=session.user.user_metadata?.full_name||session.user.user_metadata?.name||'';if($('tailorCustomerName')&&!$('tailorCustomerName').value)$('tailorCustomerName').value=savedName;
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


const measurementSets={
 Suit:[['Neck circumference','neck'],['Shoulder to shoulder','shoulders'],['Chest circumference','chest'],['Waist circumference','waist'],['Jacket length','jacket_length'],['Sleeve length','sleeve'],['Bicep circumference','bicep'],['Wrist circumference','wrist'],['Trouser inseam','inseam'],['Trouser outseam','outseam']],
 Blazer:[['Neck circumference','neck'],['Shoulder to shoulder','shoulders'],['Chest circumference','chest'],['Waist circumference','waist'],['Jacket length','jacket_length'],['Sleeve length','sleeve'],['Bicep circumference','bicep'],['Wrist circumference','wrist']],
 Shirt:[['Neck circumference','neck'],['Shoulder to shoulder','shoulders'],['Chest circumference','chest'],['Waist circumference','waist'],['Shirt length','shirt_length'],['Sleeve length','sleeve'],['Bicep circumference','bicep'],['Wrist circumference','wrist']],
 Dress:[['Bust circumference','bust'],['Under-bust circumference','under_bust'],['Waist circumference','waist'],['Hip circumference','hips'],['Shoulder width','shoulders'],['Shoulder to bust','shoulder_bust'],['Shoulder to waist','shoulder_waist'],['Sleeve length','sleeve'],['Dress length','dress_length']],
 'Clergy wear':[['Neck circumference','neck'],['Shoulder to shoulder','shoulders'],['Chest circumference','chest'],['Waist circumference','waist'],['Sleeve length','sleeve'],['Garment length','garment_length']],
 'Traditional wear':[['Shoulder to shoulder','shoulders'],['Chest circumference','chest'],['Waist circumference','waist'],['Hip circumference','hips'],['Sleeve length','sleeve'],['Garment length','garment_length']],
 Other:[['Shoulder to shoulder','shoulders'],['Chest circumference','chest'],['Waist circumference','waist'],['Hip circumference','hips'],['Sleeve length','sleeve'],['Garment length','garment_length']]
};
function renderMeasurementFields(values={}){const wrap=$('measurementFields');if(!wrap)return;const garment=$('tailorGarment')?.value||'',fields=measurementSets[garment]||[];wrap.innerHTML=fields.map(([label,key])=>'<label>'+label+'<input inputmode="decimal" type="number" min="0" step="0.1" id="measure-'+key+'" placeholder="e.g. 92"></label>').join('');$('measurementHelpNote').textContent=fields.length?'Enter body measurements in '+($('measurementUnit')?.value||'cm')+'. If you are unsure, leave the field blank and tick the tailor-assistance option.':'Choose a garment to see its measurement guide.';Object.entries(values).forEach(([key,value])=>{const el=$('measure-'+key);if(el)el.value=value;});}
function collectMeasurementValues(){const unit=$('measurementUnit')?.value||'cm',fields=measurementSets[$('tailorGarment')?.value]||[];const lines=fields.map(([label,key])=>{const el=$('measure-'+key);return el&&el.value.trim()?label+': '+el.value.trim()+' '+unit:''}).filter(Boolean);if($('needMeasurementHelp')?.checked)lines.push('Customer requests tailor assistance with measurements.');const extra=$('measurementOtherNotes')?.value.trim();if(extra)lines.push('Additional notes: '+extra);return lines.join('\n');}
function loadMeasurementValues(raw){renderMeasurementFields();const values={},remaining=[];String(raw||'').split(/\n/).forEach(line=>{const m=line.match(/^([^:]+):\s*([0-9.]+)\s*(cm|in)?$/i);if(!m){if(line.trim()&&!/requests tailor assistance/i.test(line))remaining.push(line);return;}const field=(measurementSets[$('tailorGarment').value]||[]).find(([label])=>label.toLowerCase()===m[1].toLowerCase());if(field){values[field[1]]=m[2];if(m[3])$('measurementUnit').value=m[3].toLowerCase();}else remaining.push(line);});renderMeasurementFields(values);if($('measurementOtherNotes'))$('measurementOtherNotes').value=remaining.join('\n');if(/requests tailor assistance/i.test(raw))$('needMeasurementHelp').checked=true;}
$('tailorGarment')?.addEventListener('change',()=>renderMeasurementFields());
$('measurementUnit')?.addEventListener('change',()=>renderMeasurementFields());
renderMeasurementFields();

const statusText={delivered:'Delivered',submitted:'Submitted',under_review:'Under review',awaiting_measurements:'Awaiting measurements',quoted:'Quoted',approved:'Approved',deposit_pending:'Deposit pending',in_progress:'In progress',ready:'Ready',completed:'Completed',declined:'Declined'};
let editingTailoringId=null, existingReferenceImage='', removeExistingImage=false;
function resetTailoringEditor(){editingTailoringId=null;existingReferenceImage='';removeExistingImage=false;$('tailoringForm').reset();renderMeasurementFields();$('tailorSubmit').textContent='Submit tailoring request';$('tailorCancelEdit')?.classList.add('hidden');$('tailorRemoveImage')?.classList.add('hidden');$('tailorImageStatus').textContent='';}
window.cancelTailoringEdit=()=>{resetTailoringEditor();$('tailorMessage').textContent='Editing cancelled.';};
window.editTailoringRequest=async id=>{
 const db=supa();if(!db)return;$('tailorMessage').textContent='Loading request…';
 try{const {data:r,error}=await db.from('tailoring_requests').select('*').eq('id',id).single();if(error)throw error;
 if(!['submitted','under_review','awaiting_measurements'].includes(r.status))throw new Error('This request has progressed too far for online editing. Please contact the store.');
 editingTailoringId=r.id;existingReferenceImage=r.reference_image_url||'';removeExistingImage=false;
 $('tailorGarment').value=r.garment_type||'';$('tailorCountry').value=r.country||'Kenya';$('tailorFabric').value=r.fabric||'';$('tailorColour').value=r.colour||'';$('tailorDate').value=r.desired_completion_date||'';$('tailorStyle').value=r.style_preferences||'';loadMeasurementValues(r.measurements||'');$('tailorNotes').value=r.special_instructions||'';$('tailorCustomerName').value=r.customer_name||'';$('tailorCustomerPhone').value=r.customer_phone||'';$('tailorImage').value='';
 $('tailorImageStatus').textContent=existingReferenceImage?'A private reference image is attached. You can keep it, replace it, or remove it.':'No reference image attached.';
 $('tailorSubmit').textContent='Save corrections';$('tailorCancelEdit').classList.remove('hidden');$('tailorRemoveImage').classList.toggle('hidden',!existingReferenceImage);$('tailorMessage').textContent='Editing '+r.reference_code+'. Your reference number will stay the same.';$('tailoringForm').scrollIntoView({behavior:'smooth',block:'start'});
 }catch(e){$('tailorMessage').textContent='Could not open request: '+e.message;}
};
window.removeTailoringImage=()=>{if(!editingTailoringId||!existingReferenceImage)return;removeExistingImage=true;$('tailorImageStatus').textContent='The existing private image will be removed when you save corrections.';$('tailorRemoveImage').classList.add('hidden');};
async function loadTailoring(db=supa()){
 if(!db)return;const box=$('tailoringList'),archivedBox=$('archivedTailoringList');if(!box)return;
 const {data,error}=await db.from('tailoring_requests').select('id,reference_code,garment_type,country,status,deposit_status,created_at,admin_note,customer_updated_at,reference_image_url,customer_message,customer_message_sent_at,archived_at').order('created_at',{ascending:false}).limit(100);
 if(error){box.textContent='Could not load tailoring requests: '+error.message;return;}
 const card=r=>'<article class="account-order"><b>'+escapeHtml(r.reference_code)+' · '+escapeHtml(r.garment_type)+'</b><p class="muted">'+escapeHtml(r.country)+' · '+(statusText[r.status]||escapeHtml(r.status))+' · Deposit: '+escapeHtml(r.deposit_status)+' (30% / balance 70%)</p>'+(r.customer_updated_at?'<p class="muted">You corrected this request on '+new Date(r.customer_updated_at).toLocaleString()+'.</p>':'')+(r.reference_image_url?'<p class="muted">Private reference image attached.</p>':'')+(r.admin_note?'<p class="muted">Store note: '+escapeHtml(r.admin_note)+'</p>':'')+(r.customer_message_sent_at&&r.customer_message?'<div class="customer-coordination"><b>Message from the P&Q team</b><p>'+escapeHtml(r.customer_message)+'</p><small>Sent '+new Date(r.customer_message_sent_at).toLocaleString()+'</small></div>':'')+(r.archived_at?'<p class="muted">Archived '+new Date(r.archived_at).toLocaleString()+'. This record remains available for your reference.</p>':(r.status==='delivered'?'<button class="btn" type="button" onclick="archiveTailoringRequest(\''+r.id+'\')">Archive delivered request</button>':''))+(['submitted','under_review','awaiting_measurements'].includes(r.status)&&!r.archived_at?'<button class="btn" type="button" onclick="editTailoringRequest(\''+r.id+'\')">Edit request</button>':'')+'</article>';
 const active=data.filter(r=>!r.archived_at),archived=data.filter(r=>r.archived_at);
 box.innerHTML=active.length?active.map(card).join(''):'No active tailoring requests yet.';
 if(archivedBox)archivedBox.innerHTML=archived.length?archived.map(card).join(''):'No archived requests yet.';
}
window.archiveTailoringRequest=async id=>{if(!confirm('Archive this delivered request? It will remain saved and visible in your archived list.'))return;try{const {error}=await supa().rpc('archive_own_delivered_tailoring_request',{p_request_id:id});if(error)throw error;await loadTailoring();$('tailorMessage').textContent='Delivered request archived. Your record has not been deleted.';}catch(e){$('tailorMessage').textContent='Could not archive request: '+e.message}};

$('tailoringForm')?.addEventListener('submit',async e=>{
 e.preventDefault();const db=supa(),btn=$('tailorSubmit'),msg=$('tailorMessage');if(!db){msg.textContent='Store connection unavailable.';return;}btn.disabled=true;msg.textContent=editingTailoringId?'Saving corrections…':'Submitting…';let uploadedPath='';
 try{
  if(!$('tailorTerms').checked)throw new Error('Please accept the Terms & Policies before submitting.');const file=$('tailorImage').files[0];let imageUrl=editingTailoringId?(removeExistingImage?'':existingReferenceImage):'';
  if(file){if(file.size>6*1024*1024)throw new Error('Please use an image smaller than 6 MB.');if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Use a JPG, PNG or WebP image.');
   const {data:{session}}=await db.auth.getSession();if(!session)throw new Error('Please sign in again.');const ext=file.type==='image/jpeg'?'jpg':file.type.split('/')[1];uploadedPath=session.user.id+'/'+crypto.randomUUID()+'.'+ext;
   const {error}=await db.storage.from('tailoring-references').upload(uploadedPath,file,{contentType:file.type,upsert:false});if(error)throw error;imageUrl=uploadedPath;
  }
  const fields={p_garment_type:$('tailorGarment').value,p_fabric:$('tailorFabric').value.trim(),p_colour:$('tailorColour').value.trim(),p_style_preferences:$('tailorStyle').value.trim(),p_measurements:collectMeasurementValues(),p_reference_image_url:imageUrl,p_special_instructions:$('tailorNotes').value.trim()+'\\n[Terms & Policies accepted: P&Q-2026-01 at '+new Date().toISOString()+']',p_desired_completion_date:$('tailorDate').value||null,p_country:$('tailorCountry').value};
  if(editingTailoringId){
   const {data,error}=await db.rpc('update_customer_tailoring_request',{p_request_id:editingTailoringId,...fields,p_customer_name:$('tailorCustomerName').value.trim(),p_customer_phone:$('tailorCustomerPhone').value.trim()});if(error)throw error;
   const oldPath=data?.old_reference_image_url;if(oldPath&&oldPath!==imageUrl){const {error:removeError}=await db.storage.from('tailoring-references').remove([oldPath]);if(removeError)msg.textContent='Corrections saved, but the old private image could not be removed. Please contact the store.';}
   if(!msg.textContent.startsWith('Corrections saved'))msg.textContent='Corrections saved for '+data.reference_code+'. Your original request and reference number are unchanged.';
   resetTailoringEditor();
  }else{
   const {data,error}=await db.rpc('submit_tailoring_request_with_contact',{...fields,p_customer_name:$('tailorCustomerName').value.trim(),p_customer_phone:$('tailorCustomerPhone').value.trim()});if(error)throw error;
   const ref=data.reference_code;const waText='Hello Outfits with Perez & Qhasukhu. I have submitted a custom tailoring request. Reference: '+ref+'. Customer: '+$('tailorCustomerName').value.trim()+'. Phone: '+$('tailorCustomerPhone').value.trim()+'. Garment: '+$('tailorGarment').value+'. Country: '+$('tailorCountry').value+'. Please guide me on the next steps.';
   msg.innerHTML='Request submitted. Your reference is <strong>'+escapeHtml(ref)+'</strong>. The team will review it before confirming price, timing or deposit. <a href="https://wa.me/254799281744?text='+encodeURIComponent(waText)+'" target="_blank" rel="noopener">Continue on WhatsApp</a>';$('tailoringForm').reset();
  }
  await loadTailoring(db);
 }catch(err){if(uploadedPath)await db.storage.from('tailoring-references').remove([uploadedPath]);msg.textContent='Could not save request: '+err.message;}finally{btn.disabled=false;}
});
window.requestCancellation=async id=>{const reason=prompt('Why would you like to cancel this order?');if(reason===null)return;try{const {error}=await supa().rpc('request_order_cancellation',{p_order_id:id,p_reason:reason});if(error)throw error;await loadAccount();}catch(e){alert(e.message)}};
window.withdrawCancellation=async id=>{try{const {error}=await supa().rpc('withdraw_order_cancellation',{p_order_id:id});if(error)throw error;await loadAccount();}catch(e){alert(e.message)}};
window.submitReview=async id=>{try{const rating=Number($('rating-'+id).value),review=$('review-'+id).value;const {error}=await supa().rpc('submit_verified_product_review',{p_order_item_id:id,p_rating:rating,p_review_text:review});if(error)throw error;alert('Review submitted for admin moderation. Thank you!');$('review-'+id).disabled=true;}catch(e){alert(e.message)}};
