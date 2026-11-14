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
   const {data,error}=await db.auth.signUp({email,password,options:{data:{full_name:name}}});if(error)throw error;
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
 const {data:orders,error}=await db.from('orders').select('id,customer_name,status,payment_status,total_kes,created_at,order_items(product_name,quantity,size,unit_price_kes)').order('created_at',{ascending:false}).limit(100);
 if(error){$('ordersMessage').textContent='Could not load your orders: '+error.message;return}
 if(!orders.length){$('ordersMessage').textContent='No orders are linked to this account yet.';$('ordersList').innerHTML='';return}
 $('ordersMessage').textContent=`${orders.length} order${orders.length===1?'':'s'} found.`;
 $('ordersList').innerHTML=orders.map(o=>{const ref=String(o.id).slice(0,8).toUpperCase();const stage=labels[o.status]||String(o.status).replaceAll('_',' ');const items=(o.order_items||[]).map(i=>`${escapeHtml(i.product_name)}${i.size?' · Size '+escapeHtml(i.size):''} × ${i.quantity} — ${money(i.unit_price_kes*i.quantity)}`).join('<br>')||'Items unavailable';return `<article class="account-order"><div class="order-top"><strong>Order #${ref}</strong><span class="order-stage">${escapeHtml(stage)}</span></div><p class="muted">Placed ${new Date(o.created_at).toLocaleString()} · Payment: ${escapeHtml(o.payment_status)}</p><div class="order-items">${items}</div><p><strong>Total: ${money(o.total_kes)}</strong></p></article>`}).join('');
}
function escapeHtml(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
$('signOut').onclick=async()=>{const db=supa();if(db)await db.auth.signOut();$('ordersCard').classList.add('hidden');$('authCard').classList.remove('hidden');$('authMessage').textContent='You have signed out.'};
(async()=>{const db=supa();if(!db){$('authMessage').textContent='Store connection unavailable. Please contact the store.';return}
 await loadAccount();
 db.auth.onAuthStateChange((_event,session)=>{if(session)setTimeout(()=>loadAccount(),0);else{$('ordersCard').classList.add('hidden');$('authCard').classList.remove('hidden')}});
 const params=new URLSearchParams(location.search);if(params.get('return')==='checkout')$('authMessage').textContent='Sign in or create an account to continue checkout. After signing in, return to your bag and submit your order.';
})();
