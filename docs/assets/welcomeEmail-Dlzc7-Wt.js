import{s as y,t as v}from"./index-CBZVM43o.js";const h={admin:"Org Admin",user:"Lab Manager",lab_user:"Lab User"},C=["admin","user","lab_user"];async function f(o){const s=(o||"").trim().toLowerCase();if(!s)return{rows:[],error:null};const{data:x,error:a}=await y.from("users").select("id, role, is_active, organization_id").ilike("email",s);return{rows:x||[],error:a}}async function _(o){const{rows:s,error:x}=await f(o);return x?{roles:[],error:x}:{roles:[...new Set(s.filter(a=>a.is_active!==!1).map(a=>a.role))],error:null}}async function k({email:o,roles:s,template:x,orgId:a}){const n=(o||"").trim().toLowerCase();if(!n)return{error:"This person needs an email address — roles are linked by email."};const r=C.filter(e=>s.includes(e));if(!r.length)return{error:"Select at least one role."};const{rows:i,error:m}=await f(n);if(m)return{error:"Could not read existing roles: "+m.message};const l=[],c=[];for(const e of r){if(i.find(t=>t.role===e&&t.is_active!==!1))continue;const w=i.find(t=>t.role===e&&t.is_active===!1);if(w){const{error:t}=await y.from("users").update({is_active:!0}).eq("id",w.id);if(t)return{error:"Could not restore "+h[e]+": "+t.message};l.push(e);continue}const{error:d}=await y.from("users").insert({name:(x==null?void 0:x.name)||null,last_name:(x==null?void 0:x.last_name)||null,nick_name:(x==null?void 0:x.nick_name)||null,email:n,phone:(x==null?void 0:x.phone)||null,auth_id:(x==null?void 0:x.auth_id)||null,organization_id:a||(x==null?void 0:x.organization_id)||null,role:e,admin_level:e==="admin"?1:0,is_active:!0,must_change_password:!1,photo_url:(x==null?void 0:x.photo_url)||null,avatar:(x==null?void 0:x.avatar)||null});if(d)return{error:"Could not add "+h[e]+": "+d.message};l.push(e)}for(const e of i){if(e.is_active===!1||r.includes(e.role))continue;const{error:u}=await y.from("users").update({is_active:!1}).eq("id",e.id);if(u)return{error:"Could not remove "+h[e.role]+": "+u.message};c.push(e.role)}return{added:l,removed:c,error:null}}function L({added:o=[],removed:s=[]}){const x=[];return o.length&&x.push("added "+o.map(a=>h[a]).join(", ")),s.length&&x.push("removed "+s.map(a=>h[a]).join(", ")),x.length?x.join(" · "):"no role changes"}const p="https://ictlab.labhive.app",g="https://ict.illinois.edu",T=[`<strong>ICT Lab Access Website.</strong> To access the ICT labs we use a separate
   website: <a href="`+p+'" style="color:#1D9E75;font-weight:600;">'+p+`</a>.
   Please note this is different from the main ICT website,
   <a href="`+g+'" style="color:#1D9E75;">'+g+"</a>.",`When you open the ICT Lab Access website, you will be asked to enter your
   temporary password — it is included in this email. Use it to log in, then
   change it to your own password.`,`Once you log in, you will be asked to complete the required safety training
   before you can reach the homepage and use the website features.`,`Under the <strong>Safety</strong> tab, please start with Step 1, followed by
   Step 2, and then Step 3.`,`Once you have uploaded the required certifications and passed the knowledge
   tests, a lab manager will review and approve your access. After approval you
   may begin using the website and accessing the available lab features.`,`Please let us know if you have any questions or need assistance during the
   process.`];async function S(o,{name:s,toEmail:x,orgId:a,userId:n=null,password:r=null}){if(!x)return;let i=null;if(a){const{data:t}=await o.from("organizations").select("name, contact_name, contact_email").eq("id",a).maybeSingle();t&&(i=t)}const m="Your ICT-Lab account is ready",l="Welcome to ICT, "+s+"!",c=`Hi,

Please follow the steps below to complete your ICT website registration and safety training. Once you complete these steps, we will schedule a short safety tour for you, and you will be able to start exploring the website features.

Thank you, and welcome to ICT!

1. ICT Lab Access Website. To access the ICT labs we use a separate website: `+p+". Please note this is different from the main ICT website, "+g+`.
2. When you open the ICT Lab Access website, you will be asked to enter your temporary password — it is included in this email. Use it to log in, then change it to your own password.
3. Once you log in, you will be asked to complete the required safety training before you can reach the homepage and use the website features.
4. Under the Safety tab, please start with Step 1, followed by Step 2, and then Step 3.
5. Once you have uploaded the required certifications and passed the knowledge tests, a lab manager will review and approve your access. After approval you may begin using the website and accessing the available lab features.
6. Please let us know if you have any questions or need assistance during the process.

Again, welcome to ICT! We look forward to working with you.`,e="margin:0 0 16px;font-size:14px;color:#4B5563;line-height:1.7;",u=`
            <p style="`+e+`">Hi,</p>
            <p style="`+e+`">Please follow the steps below to complete your ICT website registration
              and safety training. Once you complete these steps, we will schedule a short safety tour
              for you, and you will be able to start exploring the website features.</p>
            <p style="`+e+`">Thank you, and welcome to ICT!</p>
            <ol style="margin:0 0 24px;padding-left:20px;font-size:14px;color:#4B5563;line-height:1.7;">
              `+T.map(t=>'<li style="margin-bottom:10px;">'+t+"</li>").join(`
              `)+`
            </ol>
            <p style="margin:0 0 28px;font-size:14px;color:#4B5563;line-height:1.7;">
              Again, welcome to ICT! We look forward to working with you.</p>`,w=v({title:l,body:c,bodyHtml:u,ctaLabel:"Open ICT Lab Access →",ctaUrl:p,prefsUrl:p+"/?screen=profile",orgContact:i,credentials:r?{email:x,password:r}:null}),{error:d}=await o.from("email_notifications_queue").insert({to_email:x,subject:m,body:c,html_body:w,user_id:n,type:"welcome"});d&&console.warn("Welcome email queue failed:",d.message)}export{C as R,h as a,_ as b,L as d,S as q,k as s};
