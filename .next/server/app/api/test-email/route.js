"use strict";(()=>{var e={};e.id=528,e.ids=[528],e.modules={53524:e=>{e.exports=require("@prisma/client")},20399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},30517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},78893:e=>{e.exports=require("buffer")},61282:e=>{e.exports=require("child_process")},84770:e=>{e.exports=require("crypto")},80665:e=>{e.exports=require("dns")},17702:e=>{e.exports=require("events")},92048:e=>{e.exports=require("fs")},32615:e=>{e.exports=require("http")},35240:e=>{e.exports=require("https")},98216:e=>{e.exports=require("net")},19801:e=>{e.exports=require("os")},55315:e=>{e.exports=require("path")},76162:e=>{e.exports=require("stream")},82452:e=>{e.exports=require("tls")},17360:e=>{e.exports=require("url")},21764:e=>{e.exports=require("util")},71568:e=>{e.exports=require("zlib")},61574:e=>{e.exports=import("@prisma/adapter-pg")},8678:e=>{e.exports=import("pg")},94474:(e,r,t)=>{t.a(e,async(e,s)=>{try{t.r(r),t.d(r,{originalPathname:()=>h,patchFetch:()=>u,requestAsyncStorage:()=>l,routeModule:()=>c,serverHooks:()=>m,staticGenerationAsyncStorage:()=>d});var a=t(49303),o=t(88716),i=t(60670),n=t(93576),p=e([n]);n=(p.then?(await p)():p)[0];let c=new a.AppRouteRouteModule({definition:{kind:o.x.APP_ROUTE,page:"/api/test-email/route",pathname:"/api/test-email",filename:"route",bundlePath:"app/api/test-email/route"},resolvedPagePath:"C:\\hrms-project\\src\\app\\api\\test-email\\route.ts",nextConfigOutput:"",userland:n}),{requestAsyncStorage:l,staticGenerationAsyncStorage:d,serverHooks:m}=c,h="/api/test-email/route";function u(){return(0,i.patchFetch)({serverHooks:m,staticGenerationAsyncStorage:d})}s()}catch(e){s(e)}})},93576:(e,r,t)=>{t.a(e,async(e,s)=>{try{t.r(r),t.d(r,{POST:()=>p});var a=t(7371),o=t(92606),i=t(71922),n=e([i]);async function p(e){try{let r=e.headers.get("authorization");if(!r)return a.Rf.error("Authorization header missing",401);let t=r.replace("Bearer ",""),s=(0,o.MH)(t,["HR","SUPER_ADMIN"]),n=(await e.json()).email;if(!n)return a.Rf.error("Email field is required",400);return await (0,i.f)({firstName:"Test",lastName:"User",email:n,staffId:"TEST001",department:"IT"},{month:"January",year:2025,netSalary:15e4}),a.Rf.success({emailSentTo:n,requestedBy:s.userId,message:"SMTP configuration is correct"},"Test email sent successfully")}catch(e){return(0,a.zG)(e)}}i=(n.then?(await n)():n)[0],s()}catch(e){s(e)}})},92606:(e,r,t)=>{t.d(r,{MH:()=>u,fT:()=>i,mk:()=>p});var s=t(41482),a=t.n(s);function o(){let e=process.env.JWT_SECRET;if(!e)throw Error("JWT_SECRET environment variable is not set");return e}function i(e,r="7d"){return a().sign(e,o(),{expiresIn:r})}t(42023);let n=e=>{try{return a().verify(e,o())}catch{return null}},p=e=>{if(!e)throw Error("Authentication required");let r=n(e);if(!r)throw Error("Invalid or expired token");return r},u=(e,r)=>{let t=p(e);if(!r.includes(t.role))throw Error("Insufficient permissions");return t}},52850:(e,r,t)=>{t.a(e,async(e,s)=>{try{t.d(r,{_:()=>l});var a=t(53524),o=t(61574),i=t(8678),n=e([o,i]);[o,i]=n.then?(await n)():n;let p=globalThis,u=p.pool??new i.Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:!1}}),c=new o.PrismaPg(u),l=p.prisma??new a.PrismaClient({adapter:c,log:["query","error","warn"]});s()}catch(e){s(e)}})},71922:(e,r,t)=>{t.a(e,async(e,s)=>{try{t.d(r,{f:()=>n});var a=t(55245),o=t(52850),i=e([o]);o=(i.then?(await i)():i)[0];let p=a.createTransport({host:process.env.SMTP_HOST||"smtp.gmail.com",port:parseInt(process.env.SMTP_PORT||"587"),secure:!1,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});async function n(e,r){let t=await o._.company.findUnique({where:{id:e.companyId}}),s=`${process.env.NEXTAUTH_URL}/profile`,a={from:t?.email||process.env.SMTP_FROM||"no-reply@hrms.com",to:e.email,subject:`Your Payslip for ${r.month} ${r.year}`,html:`
      <html>
      <body style="font-family: Arial, sans-serif;">
        <div style="max-width: 600px; margin: auto;">
          <div style="background-color: #2c5530; color: white; padding: 20px;">
            <h1 style="margin:0;">${t?.companyName||"Your Company"}</h1>
            <h3 style="margin:0;">Payslip Notification</h3>
          </div>

          <div style="padding: 20px; background: #f9f9f9;">
            <p>Hello ${e.firstName} ${e.lastName},</p>
            <p>Your payslip for <strong>${r.month} ${r.year}</strong> is ready.</p>

            <p><strong>Net Salary:</strong> ₦${Number(r.netSalary||r.netPay).toLocaleString("en-NG",{minimumFractionDigits:2})}</p>

            <p>Department: ${e.department}</p>

            <p style="text-align:center; margin-top:20px;">
              <a href="${s}"
                 style="background:#2c5530;color:white;padding:10px 20px;
                 border-radius:6px;text-decoration:none;">
                View Payslip
              </a>
            </p>

            <p>Best regards,<br>${t?.companyName} HR</p>
          </div>
        </div>
      </body>
      </html>
    `};await p.sendMail(a)}s()}catch(e){s(e)}})},7371:(e,r,t)=>{t.d(r,{Rf:()=>a,zG:()=>o});var s=t(87070);class a{static success(e,r="Success",t=200){return s.NextResponse.json({success:!0,message:r,data:e},{status:t})}static error(e="Error",r=400,t){return s.NextResponse.json({success:!1,message:e,errors:t||[]},{status:r})}static unauthorized(e="Unauthorized"){return this.error(e,401)}static forbidden(e="Forbidden"){return this.error(e,403)}static notFound(e="Resource not found"){return this.error(e,404)}static serverError(e="Internal server error"){return this.error(e,500)}}let o=e=>(console.error("API Error:",e),e instanceof Error)?a.error(e.message):a.serverError()}};var r=require("../../../webpack-runtime.js");r.C(e);var t=e=>r(r.s=e),s=r.X(0,[377,443,70,245],()=>t(94474));module.exports=s})();