// Explicitly run by the owner after private setup. No message reads or sends.
const {createMailbox}=require('./mailbox');
if(!process.argv.includes('--verify-auth')){
 console.log('No authentication attempted. Run with --verify-auth only after secure configuration and approval.');
 process.exit(0);
}
(async()=>{
 const mail=createMailbox({...process.env,MAIL_CONNECTION_ENABLED:'true',MAIL_SEND_ENABLED:'false'});
 const result=await mail.verify();
 console.log(JSON.stringify({authenticated:result.authenticated,sentFolder:result.sentFolder,sendingEnabled:false,messagesRead:0,emailsSent:0}));
})().catch(()=>{console.error('Mailbox authentication/folder verification did not complete. Check the private settings. No email was sent.');process.exitCode=1;});
