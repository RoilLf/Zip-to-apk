const express=require("express"),multer=require("multer"),fs=require("fs"),path=require("path"),os=require("os"),{execFile}=require("child_process"),{promisify}=require("util"),archiver=require("archiver"),unzipper=require("unzipper");
const exec=promisify(execFile),app=express(),upload=multer({dest:path.join(os.tmpdir(),"web2app-uploads")});
app.use(express.static(path.join(__dirname,"../frontend")));
function safe(v,f){return String(v||f).replace(/[^a-zA-Z0-9._-]/g,"_")}
function validPkg(p){return /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(p)}
async function copyProject(input,dst){
 fs.mkdirSync(dst,{recursive:true});
 if(input.originalname.toLowerCase().endsWith(".html")||input.originalname.toLowerCase().endsWith(".htm")) fs.copyFileSync(input.path,path.join(dst,"index.html"));
 else await fs.createReadStream(input.path).pipe(unzipper.Extract({path:dst})).promise();
}
function zipDir(src,out){return new Promise((res,rej)=>{const o=fs.createWriteStream(out),a=archiver("zip",{zlib:{level:9}});o.on("close",res);a.on("error",rej);a.pipe(o);a.directory(src,false);a.finalize()})}
app.post("/api/build",upload.single("project"),async(req,res)=>{
 let work=fs.mkdtempSync(path.join(os.tmpdir(),"web2app-"));
 try{
  if(!req.file)throw Error("Missing project"); const name=safe(req.body.name,"My App"),pkg=validPkg(req.body.package)?req.body.package:"com.example.myapp";
  const version=safe(req.body.version,"1.0.0"),orientation=["portrait","landscape","unspecified"].includes(req.body.orientation)?req.body.orientation:"unspecified";
  const type=req.body.type==="release"?"release":"debug";
  const project=path.join(work,"app");await copyProject(req.file,project);
  const tpl=path.join(__dirname,"../android-template");fs.cpSync(tpl,path.join(work,"build"),{recursive:true});
  const dest=path.join(work,"build");fs.cpSync(project,path.join(dest,"app/src/main/assets/www"),{recursive:true});
  let gradle=fs.readFileSync(path.join(dest,"app/build.gradle"),"utf8").replaceAll("__PACKAGE__",pkg).replaceAll("__VERSION__",version).replaceAll("__APP_NAME__",name).replaceAll("__ORIENTATION__",orientation);
  fs.writeFileSync(path.join(dest,"app/build.gradle"),gradle);
  let man=fs.readFileSync(path.join(dest,"app/src/main/AndroidManifest.xml"),"utf8").replaceAll("__PACKAGE__",pkg).replaceAll("__APP_NAME__",name).replaceAll("__ORIENTATION__",orientation);
  fs.writeFileSync(path.join(dest,"app/src/main/AndroidManifest.xml"),man);
  const javaDir=path.join(dest,"app/src/main/java",...pkg.split("."));fs.mkdirSync(javaDir,{recursive:true});
  let java=fs.readFileSync(path.join(dest,"app/src/main/java/com/web2app/builder/MainActivity.java"),"utf8").replace("__PACKAGE__",pkg);
  fs.writeFileSync(path.join(javaDir,"MainActivity.java"),java);fs.rmSync(path.join(dest,"app/src/main/java/com/web2app"),{recursive:true,force:true});
  const gradleCmd=process.env.GRADLE_CMD||"gradle";
  const task=type==="release"?":app:assembleRelease":":app:assembleDebug";
  await exec(gradleCmd,[task,"--no-daemon","--stacktrace"],{cwd:dest,timeout:300000,maxBuffer:1024*1024*8});
  const apk=path.join(dest,"app","build","outputs","apk",type,`app-${type}.apk`);
  if(!fs.existsSync(apk))throw Error("APK output was not produced");
  res.download(apk,`${name.replace(/[^a-z0-9_-]/gi,"_")}.apk`);
 }catch(e){res.status(500).send(e.stderr||e.message||"Build failed")}finally{try{fs.rmSync(work,{recursive:true,force:true})}catch{}try{fs.rmSync(req.file?.path,{force:true})}catch{}}
});
app.listen(process.env.PORT||3000,()=>console.log("Web2App listening on port "+(process.env.PORT||3000)));
