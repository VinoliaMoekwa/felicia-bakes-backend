const express=require('express');const {installAdmin}=require('./admin');
const app=express();const jsonBody=express.json({limit:'100kb'});app.use((req,res,next)=>req.path==='/admin/api/mail/send'?next():jsonBody(req,res,next));
installAdmin(app,null,{env:{DASHBOARD_DEMO:'true',DASHBOARD_DEMO_SHOWCASE:'true',STAFF_OWNER_PASSWORD:'local-owner-only',STAFF_DEVELOPER_PASSWORD:'local-dev-only',NODE_ENV:'development'}});
app.listen(Number(process.env.PORT)||3204,'127.0.0.1',()=>console.log('Local demo: http://127.0.0.1:3204/admin/ (owner: info@feliciabakes.co.za / local-owner-only; developer: dev@feliciabakes.co.za / local-dev-only)'));
