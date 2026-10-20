// Shared, server-rendered branding for individual business emails. No marketing delivery.
const BRAND=Object.freeze({name:'Felicia Bakes',replyTo:'info@feliciabakes.co.za',website:'https://feliciabakes.co.za',logo:'https://feliciabakes.co.za/images/felicia-bakes-logo.png',instagram:'https://www.instagram.com/felicia__bakes/',tiktok:'https://www.tiktok.com/@felicia.bakes',whatsapp:'https://wa.me/27813315267'});
const escapeHTML=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const linkStyle='color:#574a7e;text-decoration:underline;';
function messageHTML(text){
 return String(text).replace(/\r\n?/g,'\n').split(/(https?:\/\/[^\s<>"']+)/gi).map((part,index)=>{
  if(index%2===0)return escapeHTML(part).replace(/\n/g,'<br>');
  const trailing=part.match(/[.,!?;:)\]}]+$/)?.[0]||'',url=trailing?part.slice(0,-trailing.length):part;
  try{if(!['http:','https:'].includes(new URL(url).protocol))throw Error();return `<a href="${escapeHTML(url)}" rel="noopener noreferrer" style="${linkStyle}word-break:break-word;">${escapeHTML(url)}</a>${escapeHTML(trailing)}`;}catch{return escapeHTML(part);}
 }).join('');
}
function renderOutgoingEmail({subject='',text='',reply=false}={}){
 const originalText=String(text);
 const title=reply?'':`<h1 style="margin:0 0 16px;color:#574a7e;font-family:'Arial',Helvetica,sans-serif;font-size:22px;line-height:1.35;font-weight:700;overflow-wrap:anywhere;word-wrap:break-word;word-break:break-word;">${escapeHTML(subject)}</h1>`;
 const a=(url,label)=>`<a href="${escapeHTML(url)}" style="${linkStyle}" rel="noopener noreferrer">${label}</a>`;
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(subject)}</title></head><body style="margin:0;padding:0;background-color:#ffffff;color:#333333;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;background-color:#ffffff;border-collapse:collapse;"><tr><td align="center" style="padding:28px 12px;">
<!--[if mso]><table role="presentation" width="600" align="center"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;table-layout:fixed;background-color:#ffffff;border-collapse:collapse;border:1px solid #f4d1df;border-top:3px solid #ff6098;">
<tr><td style="padding:18px 24px 12px;border-bottom:1px solid #f4d1df;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td valign="middle"><p style="margin:0;font-family:'Arial',Helvetica,sans-serif;font-size:22px;line-height:1.2;font-weight:700;color:#574a7e;">Felicia Bakes</p><p style="margin:4px 0 0;font-family:'Arial',Helvetica,sans-serif;font-size:11px;line-height:1.5;color:#6b6175;letter-spacing:0.04em;">Everything sweet &amp; pretty</p></td></tr></table></td></tr>
<tr><td style="padding:24px 24px 18px;font-family:'Arial',Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#333333;">${title}<div style="margin:0;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;">${messageHTML(originalText)}</div></td></tr>
<tr><td style="padding:18px 24px 22px;background-color:#ffffff;border-top:1px solid #f4d1df;font-family:'Arial',Helvetica,sans-serif;font-size:12px;line-height:1.8;color:#666666;"><p style="margin:0 0 6px;color:#574a7e;font-size:13px;font-weight:700;">Felicia Bakes</p><p style="margin:0;">Questions? Reply to this email or contact ${a('mailto:'+BRAND.replyTo,BRAND.replyTo)}.</p><p style="margin:6px 0 0;">${a(BRAND.website,'feliciabakes.co.za')}</p><p style="margin:8px 0 0;">${a(BRAND.instagram,'Instagram')} &nbsp;·&nbsp; ${a(BRAND.tiktok,'TikTok')} &nbsp;·&nbsp; ${a(BRAND.whatsapp,'WhatsApp')}</p></td></tr>
</table><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
 return {html,text:originalText,replyTo:BRAND.replyTo};
}
module.exports={BRAND,escapeHTML,messageHTML,renderOutgoingEmail};
