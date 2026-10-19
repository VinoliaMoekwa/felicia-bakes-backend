// Domains.co.za adapter. No connection occurs until explicitly enabled.
const { randomUUID } = require('node:crypto');
const { renderOutgoingEmail } = require('./outgoing-email-template');
const MAX_SOURCE = 20 * 1024 * 1024;
const MAX_ATTACHMENTS = 8 * 1024 * 1024;
function cleanFilename(name) {
 return String(name || 'attachment').split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f"\r\n]/g, '').slice(0, 150) || 'attachment';
}
function readableText(parsed, convert) {
 const text = parsed.text || (parsed.html ? convert(parsed.html, {
  wordwrap: false,
  selectors: ['head','style','title','script','noscript','iframe','object','svg','img'].map(selector => ({ selector, format: 'skip' }))
 }) : 'No text content available.');
 return String(text).replace(/\0/g, '').slice(0, 200000);
}
function decodeAttachments(files = []) {
 if (!Array.isArray(files) || files.length > 5) throw Error('Attach at most five files.');
 let total = 0;
 return files.map(file => {
  if (typeof file.content !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.content) || file.content.length > Math.ceil(MAX_ATTACHMENTS * 4 / 3) + 4) throw Error('Invalid attachment.');
  const content = Buffer.from(file.content, 'base64'); total += content.length;
  if (!content.length || total > MAX_ATTACHMENTS) throw Error('Attachments must total no more than 8 MB.');
  let contentType;
  if (content.subarray(0,3).equals(Buffer.from([255,216,255]))) contentType = 'image/jpeg';
  else if (content.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) contentType = 'image/png';
  else if (content.subarray(0,4).toString()==='RIFF' && content.subarray(8,12).toString()==='WEBP') contentType = 'image/webp';
  else if (content.subarray(0,5).toString()==='%PDF-') contentType = 'application/pdf';
  else throw Error('Use a JPG, PNG, WebP or PDF attachment.');
  return { filename: cleanFilename(file.filename), content, contentType, contentDisposition: 'attachment' };
 });
}
function createMailbox(env = process.env, injected = {}) {
 if (env.MAIL_CONNECTION_ENABLED !== 'true') return null;
 const password=env.MAILBOX_PASSWORD||(env.MAILBOX_PASSWORD_B64?Buffer.from(env.MAILBOX_PASSWORD_B64,'base64').toString('utf8'):'');
 if (!env.MAIL_IMAP_HOST || !env.MAILBOX_ADDRESS || !password) throw Error('Mailbox setup is incomplete.');
 const sendingEnabled = env.MAIL_SEND_ENABLED === 'true';
 const transport=env.MAIL_SEND_TRANSPORT||'smtp';
 if(sendingEnabled&&transport==='brevo'&&env.BREVO_FREE_SENDING_CONFIRMED!=='true')throw Error('Confirm the existing free allowance and no paid extras before enabling Brevo sending.');
 if(!['smtp','brevo'].includes(transport))throw Error('Choose an explicitly supported sending transport.');
 if (sendingEnabled && transport==='smtp' && (!env.MAIL_SMTP_HOST || Number(env.MAIL_SMTP_PORT || 465) !== 465)) throw Error('The verified SMTP settings require implicit TLS on port 465.');
 if (sendingEnabled && transport==='smtp' && env.RENDER && env.RENDER_SMTP_CONFIRMED !== 'true') throw Error('Render Free blocks SMTP. Confirm supported hosting before enabling SMTP sends.');
 const ImapFlow = injected.ImapFlow || require('imapflow').ImapFlow;
 const nodemailer = injected.nodemailer || require('nodemailer');
 const simpleParser = injected.simpleParser || require('mailparser').simpleParser;
 const convert = injected.convert || require('html-to-text').convert;
 const auth = { user: env.MAILBOX_ADDRESS, pass: password };
 const brevo=sendingEnabled&&transport==='brevo'?(injected.brevo||require('./brevo').createBrevo(env,{send:injected.fetch||fetch})):null;
 const smtp = sendingEnabled && transport==='smtp' ? nodemailer.createTransport({ host: env.MAIL_SMTP_HOST, port: 465, secure: true, auth, tls: { rejectUnauthorized: true }, connectionTimeout: 10000, socketTimeout: 20000, disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false }) : null;
 async function withClient(fn) {
  const client = new ImapFlow({ host: env.MAIL_IMAP_HOST, port: 993, secure: true, auth, tls: { rejectUnauthorized: true }, logger: false, logRaw: false, disableAutoIdle: true, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000, maxLiteralSize: MAX_SOURCE, maxResponseSize: MAX_SOURCE + 1024 * 1024 });
  client.on?.('error', () => {});
  try { await client.connect(); return await fn(client); }
  finally { try { await client.logout(); } catch { client.close?.(); } }
 }
 async function folderPath(client, kind) {
  if (kind === 'inbox') return 'INBOX';
  const folders = await client.list();
  const found = env.MAIL_SENT_FOLDER ? folders.find(f => f.path === env.MAIL_SENT_FOLDER) : folders.find(f => f.specialUse === '\\Sent');
  if (!found) throw Error('The Sent folder is not identified. Confirm MAIL_SENT_FOLDER from the provider.');
  return found.path;
 }
 function parseId(id) {
  const m = /^(?:(inbox|sent):)?(\d+)-(\d+)$/.exec(String(id));
  if (!m || !Number.isSafeInteger(Number(m[3])) || Number(m[3])<1 || Number(m[3])>4294967295) throw Error('Invalid message identifier.');
  return { kind: m[1] || 'inbox', validity: m[2], uid: m[3] };
 }
 async function selected(client, kind, fn) {
  const path = await folderPath(client, kind), lock = await client.getMailboxLock(path, { readOnly: true });
  try { return await fn(); } finally { lock.release(); }
 }
 const address = a => (a || []).map(x => x.name ? `${x.name} <${x.address}>` : x.address).join(', ');
 async function parsedMessage(client, id) {
  const key = parseId(id);
  return selected(client, key.kind, async () => {
   if (String(client.mailbox.uidValidity) !== key.validity) throw Error('Mailbox changed. Refresh the message list.');
   const meta = await client.fetchOne(key.uid, { size: true }, { uid: true });
   if (!meta || meta.size > MAX_SOURCE) throw Error('Message is missing or exceeds the 20 MB preview limit.');
   const message = await client.fetchOne(key.uid, { source: true }, { uid: true });
   if (!message?.source || message.source.length > MAX_SOURCE) throw Error('Message could not be loaded.');
   return simpleParser(message.source, { skipHtmlToText: true, skipTextToHtml: true, skipImageLinks: true });
  });
 }
 return {
  sendingEnabled,
  async verify() { return withClient(async c => ({ authenticated: true, sentFolder: await folderPath(c, 'sent'), sendingEnabled })); },
  async list({ folder = 'inbox', page = 1 } = {}) {
   const kind = folder === 'sent' ? 'sent' : 'inbox';
   return withClient(c => selected(c, kind, async () => {
    if (!c.mailbox.exists) return [];
    const rows = [], end=c.mailbox.exists-(Math.max(1,Math.min(10000,Number.parseInt(page,10)||1))-1)*25;if(end<1)return [];
    for await (const m of c.fetch(`${Math.max(1,end-24)}:${end}`, { envelope: true, uid: true, flags: true })) rows.push({ id: `${kind}:${c.mailbox.uidValidity}-${m.uid}`, from: kind === 'sent' ? address(m.envelope.to) : address(m.envelope.from), subject: m.envelope.subject || '', date: m.envelope.date?.toISOString(), unread: !m.flags?.has('\\Seen') });
    return rows.reverse();
   }));
  },
  async read(id) { return withClient(async c => {
   const parsed = await parsedMessage(c,id);
   return { id, subject: parsed.subject || '', from: parsed.from?.text || '', replyTo: parseId(id).kind==='sent'?(parsed.to?.value?.[0]?.address||''):(parsed.replyTo?.value?.[0]?.address || parsed.from?.value?.[0]?.address || ''), date: parsed.date?.toISOString(), text: readableText(parsed,convert), attachments: parsed.attachments.map((a,index) => ({ index,filename:cleanFilename(a.filename),size:a.size,contentType:a.contentType,downloadable:a.size<=MAX_ATTACHMENTS })) };
  }); },
  async attachment(id,index) { return withClient(async c => {
   const parsed = await parsedMessage(c,id), attachment = parsed.attachments[index];
   if (!Number.isInteger(index) || index<0 || !attachment || attachment.size>MAX_ATTACHMENTS) throw Error('Attachment is unavailable or exceeds 8 MB.');
   return { filename:cleanFilename(attachment.filename),content:attachment.content,contentType:'application/octet-stream' };
  }); },
  async send({ to,subject,text,replyId,attachments=[],requestId }) {
   if (!smtp&&!brevo) throw Error('Sending is disabled. Inbox access does not enable outgoing mail.');
   if(typeof to!=='string'||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to)||typeof subject!=='string'||!subject.trim()||/[\r\n]/.test(subject)||typeof text!=='string'||!text.trim())throw Error('Enter a valid recipient, subject and message.');
   const files = decodeAttachments(attachments);
   return withClient(async c => {
    // Resolve the existing provider folder first. Never create/guess folders.
    const sentFolder = await folderPath(c,'sent'); let thread = {};
    if (replyId) {
     const key = parseId(replyId);
     const envelope = await selected(c,key.kind,async () => {
      if (String(c.mailbox.uidValidity)!==key.validity) throw Error('Mailbox changed. Refresh before replying.');
      return (await c.fetchOne(key.uid,{envelope:true},{uid:true}))?.envelope;
     });
     if (!envelope) throw Error('The original message is no longer available.');
     if (envelope.messageId) thread={ inReplyTo:envelope.messageId,references:envelope.messageId };
    }
    const branded=renderOutgoingEmail({subject,text,reply:!!replyId});
    const messageId=`<${randomUUID()}@${env.MAILBOX_ADDRESS.split('@')[1]}>`;
    const builder=nodemailer.createTransport({streamTransport:true,buffer:true,newline:'windows',disableFileAccess:true,disableUrlAccess:true});
    const compiled=await builder.sendMail({from:env.MAILBOX_ADDRESS,replyTo:branded.replyTo,to,subject,text,html:branded.html,messageId,...thread,attachments:files,disableFileAccess:true,disableUrlAccess:true});
    if (!Buffer.isBuffer(compiled.message)) throw Error('Email could not be prepared.');
    let sentContent=compiled.message,deliveryMessageId=compiled.messageId||messageId;
    if(brevo){
     const result=await brevo.send({from:env.MAILBOX_ADDRESS,to,subject,text,html:branded.html,thread,attachments:files,requestId});
     if(!result.accepted)throw Error('Email was not accepted by Brevo.');
     if(!result.messageId)return {messageId:null,sentCopySaved:false,warning:'Brevo accepted the email, but its Message-ID was not confirmed. The Sent copy was not saved; do not resend automatically.'};
     // The provider assigns the delivery Message-ID. Match it in the IMAP Sent representation.
     deliveryMessageId=result.messageId;sentContent=Buffer.from(compiled.message.toString('latin1').replace(/^Message-ID:.*(?:\r?\n[ \t].*)*/mi,()=> 'Message-ID: '+result.messageId),'latin1');
    }else{
     const result=await smtp.sendMail({envelope:compiled.envelope,raw:compiled.message,disableFileAccess:true,disableUrlAccess:true});
     if(!result.accepted?.length)throw Error('Email was not accepted by the mail server.');
    }
    // SMTP accepted: an append problem must not report a failed send and invite a duplicate retry.
    let sentCopySaved=true;
    try { const copied=await c.append(sentFolder,sentContent,['\\Seen'],new Date());if(!copied)throw Error('Sent copy failed'); } catch { sentCopySaved=false; }
    return { messageId:deliveryMessageId,sentCopySaved,warning:sentCopySaved?null:'Email was accepted, but the Sent-folder copy could not be saved. Do not resend automatically.' };
   });
  }
 };
}
module.exports={createMailbox,readableText,decodeAttachments,cleanFilename};
