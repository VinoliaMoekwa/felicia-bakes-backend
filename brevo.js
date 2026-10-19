const {randomUUID}=require('node:crypto');
const {renderOutgoingEmail,BRAND}=require('./outgoing-email-template');
const BASE='https://api.brevo.com/v3';
function createBrevo(env=process.env,{send=fetch}={}){
 const apiKey=env.BREVO_API_KEY||(env.BREVO_API_KEY_B64?Buffer.from(env.BREVO_API_KEY_B64,'base64').toString('utf8'):'');
 if(!apiKey)throw Error('A private Brevo API key is required.');
 async function request(path,body){const response=await send(BASE+path,{method:'POST',headers:{'api-key':apiKey,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});if(!response.ok){const error=Error(response.status===429?'Brevo sending or rate limit reached. Nothing was retried.':'Brevo did not accept this request. Check sender setup and allowance.');error.code=response.status===429?'EMAIL_LIMIT':'EMAIL_PROVIDER';throw error;}return response.json();}
 return {
  async send({from,to,subject,text,html,thread={},attachments=[],requestId}){
   // A single customer conversation. Newsletter campaigns use the separate marketing API.
   const headers={idempotencyKey:requestId||randomUUID(),...(thread.inReplyTo?{'In-Reply-To':thread.inReplyTo}:{}),...(thread.references?{References:thread.references}:{})};
   const result=await request('/smtp/email',{sender:{name:'Felicia Bakes',email:from},to:[{email:to}],replyTo:{email:BRAND.replyTo},subject,textContent:text,htmlContent:html||renderOutgoingEmail({subject,text,reply:!!thread.inReplyTo}).html,headers,tags:['felicia-bakes-dashboard'],...(attachments.length?{attachment:attachments.map(a=>({name:a.filename,content:a.content.toString('base64')}))}:{})});
   const messageId=typeof result.messageId==='string'&&/^<[^<>\r\n]+@[^<>\r\n]+>$/.test(result.messageId)?result.messageId:null;
   return {accepted:true,messageId};
  },
  async createCampaignDraft({name,subject,body}){
   if(env.BREVO_CAMPAIGN_DRAFTS_ENABLED!=='true'||env.BREVO_FELICIA_LIST_VERIFIED!=='true')throw Error('Verify a dedicated Felicia consent list before preparing a provider campaign.');
   const listId=Number(env.BREVO_FELICIA_LIST_ID),senderId=Number(env.BREVO_SENDER_ID);
   if(!Number.isSafeInteger(listId)||listId<1||!Number.isSafeInteger(senderId)||senderId<1)throw Error('The Felicia sender and list must be configured explicitly.');
   if(!subject?.trim()||!body?.trim())throw Error('A subject and message are required.');
   const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
   const htmlContent='<html><body><p>'+escape(body).replace(/\n/g,'<br>')+'</p><p><a href="{{ unsubscribe }}">Unsubscribe from the Felicia Bakes newsletter</a></p></body></html>';
   // Brevo creates this as a draft. No sendNow or scheduledAt call is made.
   return request('/emailCampaigns',{name:'Felicia Bakes — '+String(name||subject).slice(0,120),subject,sender:{id:senderId},htmlContent,replyTo:'info@feliciabakes.co.za',recipients:{listIds:[listId]},tag:'felicia-bakes-newsletter'});
  }
 };
}
module.exports={createBrevo};
