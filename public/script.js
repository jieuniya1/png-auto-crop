const $=id=>document.getElementById(id);
const presets={
  "1-balanced":{margin:6,tolerance:34,merge:10,alpha:18,removeBg:false,size:"auto"},
  "1-safe":{margin:12,tolerance:30,merge:14,alpha:12,removeBg:false,size:"auto"},
  "1-tight":{margin:3,tolerance:34,merge:8,alpha:20,removeBg:false,size:"original"},
  "2-balanced":{margin:8,tolerance:34,merge:14,alpha:18,removeBg:false,size:"auto"},
  "2-safe":{margin:14,tolerance:30,merge:18,alpha:12,removeBg:false,size:"auto"},
  "2-tight":{margin:4,tolerance:36,merge:10,alpha:20,removeBg:false,size:"original"},
  "3-balanced":{margin:8,tolerance:35,merge:16,alpha:18,removeBg:false,size:"auto"},
  "3-safe":{margin:14,tolerance:30,merge:20,alpha:12,removeBg:false,size:"auto"},
  "3-tight":{margin:4,tolerance:38,merge:12,alpha:20,removeBg:false,size:"original"},
  "4-balanced":{margin:7,tolerance:35,merge:14,alpha:18,removeBg:false,size:"auto"},
  "4-safe":{margin:12,tolerance:30,merge:18,alpha:12,removeBg:false,size:"auto"},
  "4-tight":{margin:3,tolerance:38,merge:10,alpha:20,removeBg:false,size:"original"}
};
let sources=[],results=[];

["gridSelect","cropStyle","assetType"].forEach(id=>$(id).addEventListener("change",applyPreset));
$("restorePreset").onclick=applyPreset;
["tolerance","merge","alpha"].forEach(id=>$(id).addEventListener("input",syncOutputs));

function applyPreset(){
  const key=`${$("gridSelect").value}-${$("cropStyle").value}`,p=presets[key];
  $("margin").value=p.margin;$("tolerance").value=p.tolerance;$("merge").value=p.merge;$("alpha").value=p.alpha;$("removeBg").checked=p.removeBg;$("sizeMode").value=p.size;
  $("dpi").value="120";syncOutputs();
  $("presetSummary").textContent=`여백 ${p.margin}px · 배경 ${p.tolerance} · 병합 ${p.merge}% · 알파 ${p.alpha} · ${p.size==="original"?"원본 크기 유지":"규정 최소값만 보정"}`;
}
function syncOutputs(){$("toleranceOut").textContent=$("tolerance").value;$("mergeOut").textContent=$("merge").value+"%";$("alphaOut").textContent=$("alpha").value}
applyPreset();

const fileInput=$("fileInput"),dropZone=$("dropZone"),sourceGrid=$("sourceGrid"),resultGrid=$("resultGrid"),resultPanel=$("resultPanel"),status=$("status");
fileInput.onchange=()=>addFiles(fileInput.files);$("addFiles").onclick=()=>fileInput.click();
["dragenter","dragover"].forEach(n=>dropZone.addEventListener(n,e=>{e.preventDefault();dropZone.classList.add("over")}));
["dragleave","drop"].forEach(n=>dropZone.addEventListener(n,e=>{e.preventDefault();dropZone.classList.remove("over")}));
dropZone.addEventListener("drop",e=>addFiles(e.dataTransfer.files));

function addFiles(files){
  [...files].forEach(file=>{if(["image/png","image/jpeg","image/webp"].includes(file.type))sources.push({id:crypto.randomUUID(),file,url:URL.createObjectURL(file),selected:true})});
  fileInput.value="";renderSources();status.textContent=`${sources.length}장의 이미지를 준비했습니다.`;
}
function renderSources(){
  $("sourceCount").textContent=`${sources.length}장`;
  if(!sources.length){sourceGrid.className="grid empty";sourceGrid.textContent="이미지를 추가하면 미리보기가 표시됩니다.";return}
  sourceGrid.className="grid";sourceGrid.innerHTML="";
  sources.forEach(item=>{
    const card=document.createElement("article");card.className=`card${item.selected?" selected":""}`;
    card.innerHTML=`<input type="checkbox" ${item.selected?"checked":""}><div class="checker"><img src="${item.url}"></div><div class="info"><strong>${esc(item.file.name)}</strong><small>${size(item.file.size)}</small></div>`;
    card.querySelector("input").onchange=e=>{item.selected=e.target.checked;renderSources()};sourceGrid.appendChild(card);
  });
}
$("sourceAll").onclick=()=>{sources.forEach(x=>x.selected=true);renderSources()};$("sourceNone").onclick=()=>{sources.forEach(x=>x.selected=false);renderSources()};
$("sourceDelete").onclick=()=>{sources.filter(x=>x.selected).forEach(x=>URL.revokeObjectURL(x.url));sources=sources.filter(x=>!x.selected);renderSources()};

$("process").onclick=async()=>{
  const selected=sources.filter(x=>x.selected);if(!selected.length)return alert("처리할 이미지를 선택해주세요.");
  $("process").disabled=true;clearResults();
  try{
    const n=Number($("gridSelect").value),opt={margin:Number($("margin").value),tol:Number($("tolerance").value),merge:Number($("merge").value)/100,alpha:Number($("alpha").value),removeBg:$("removeBg").checked,style:$("cropStyle").value};
    const total=selected.length*n*n;let done=0;
    for(const src of selected){
      const image=await loadImage(src.file),source=imageCanvas(image);
      for(let r=0;r<n;r++)for(let c=0;c<n;c++){
        done++;status.textContent=`${done}/${total} 처리 중...`;
        const cell=cellCanvas(source,r,c,n),out=trimIndependent(cell,opt),finalCanvas=resizeForOutput(out);
        const raw=await canvasBlob(finalCanvas),blob=await addDpi(raw,Number($("dpi").value));
        const base=src.file.name.replace(/\.[^.]+$/,""),idx=r*n+c+1,name=`${base}_element_${String(idx).padStart(2,"0")}.png`,min=getMinSize();
        results.push({id:crypto.randomUUID(),filename:name,blob,url:URL.createObjectURL(blob),width:finalCanvas.width,height:finalCanvas.height,size:blob.size,dpi:Number($("dpi").value),selected:true,compliance:compliance(finalCanvas.width,finalCanvas.height,blob.size,min)});
      }
    }
    renderResults();resultPanel.classList.remove("hidden");status.textContent=`완료: ${results.length}개를 개별 타이트 크롭했습니다.`;
  }catch(e){console.error(e);alert(e.message||"처리 오류");status.textContent="처리 중 오류가 발생했습니다."}
  finally{$("process").disabled=false}
};

function trimIndependent(canvas,opt){
  const ctx=canvas.getContext("2d",{willReadFrequently:true}),imageData=ctx.getImageData(0,0,canvas.width,canvas.height);
  if(opt.removeBg&&!realTransparency(imageData.data,opt.alpha))removeBorderBackground(imageData,canvas.width,canvas.height,opt.tol);
  const mask=alphaMask(imageData.data,canvas.width,canvas.height,opt.alpha),parts=components(mask,canvas.width,canvas.height);
  let box=mergeParts(parts,canvas.width,canvas.height,opt.merge)||maskBox(mask,canvas.width,canvas.height);
  if(!box)return canvas;
  const masked=document.createElement("canvas");masked.width=canvas.width;masked.height=canvas.height;masked.getContext("2d").putImageData(imageData,0,0);
  const long=Math.max(box.maxX-box.minX+1,box.maxY-box.minY+1);let m=Math.max(opt.margin,Math.round(long*.012));
  if(opt.style==="safe")m=Math.max(m,Math.round(long*.03));if(opt.style==="tight")m=Math.min(m,Math.max(2,Math.round(long*.005)));
  let out=crop(masked,clampRect({x:box.minX-m,y:box.minY-m,w:box.maxX-box.minX+1+m*2,h:box.maxY-box.minY+1+m*2},masked.width,masked.height));
  const d=out.getContext("2d",{willReadFrequently:true}).getImageData(0,0,out.width,out.height),b=alphaBox(d.data,out.width,out.height,opt.alpha);
  if(b){const mm=opt.style==="tight"?2:Math.min(opt.margin,10);out=crop(out,clampRect({x:b.minX-mm,y:b.minY-mm,w:b.maxX-b.minX+1+mm*2,h:b.maxY-b.minY+1+mm*2},out.width,out.height))}
  return out;
}
function resizeForOutput(c){
  const mode=$("sizeMode").value;if(mode==="original")return c;
  if(mode==="long3000"){const s=3000/Math.max(c.width,c.height);return resize(c,s)}
  if(mode==="auto"){const min=getMinSize(),mn=Math.min(c.width,c.height);return mn<min?resize(c,min/mn):c}
  return c;
}
function resize(c,s){if(Math.abs(s-1)<.001)return c;const o=document.createElement("canvas");o.width=Math.max(1,Math.round(c.width*s));o.height=Math.max(1,Math.round(c.height*s));const x=o.getContext("2d");x.imageSmoothingEnabled=true;x.imageSmoothingQuality="high";x.drawImage(c,0,0,o.width,o.height);return o}
function getMinSize(){return $("assetType").value==="icon"?700:1500}
function compliance(w,h,bytes,min){const reasons=[];if($("rulesMode").checked&&Math.min(w,h)<min)reasons.push(`최소 ${min}px 미달`);if(Math.max(w,h)>9800)reasons.push("9800px 초과");if(bytes>50*1024*1024)reasons.push("50MB 초과");return{ok:!reasons.length,reasons}}

function cellCanvas(src,r,c,n){const x0=Math.floor(c*src.width/n),x1=Math.floor((c+1)*src.width/n),y0=Math.floor(r*src.height/n),y1=Math.floor((r+1)*src.height/n);return crop(src,{x:x0,y:y0,w:x1-x0,h:y1-y0})}
function alphaMask(data,w,h,a){const m=new Uint8Array(w*h);for(let p=0;p<m.length;p++)if(data[p*4+3]>a)m[p]=1;return m}
function alphaBox(data,w,h,a){return maskBox(alphaMask(data,w,h,a),w,h)}
function maskBox(m,w,h){let minX=w,minY=h,maxX=-1,maxY=-1;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(m[y*w+x]){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y)}return maxX<0?null:{minX,minY,maxX,maxY}}
function components(mask,w,h){const seen=new Uint8Array(w*h),out=[],q=new Int32Array(w*h);for(let s=0;s<w*h;s++){if(seen[s]||!mask[s])continue;let head=0,tail=0;q[tail++]=s;seen[s]=1;let minX=w,minY=h,maxX=-1,maxY=-1,area=0;while(head<tail){const p=q[head++],x=p%w,y=Math.floor(p/w);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);area++;for(const [nx,ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1],[x+1,y+1],[x-1,y-1],[x+1,y-1],[x-1,y+1]]){if(nx<0||ny<0||nx>=w||ny>=h)continue;const np=ny*w+nx;if(!seen[np]&&mask[np]){seen[np]=1;q[tail++]=np}}}out.push({minX,minY,maxX,maxY,area})}return out}
function mergeParts(parts,w,h,ratio){if(!parts.length)return null;const a=[...parts].sort((x,y)=>y.area-x.area),noise=w*h*.00004;let m={...a[0]};for(const p of a.slice(1)){if(p.area<noise)continue;const d=gap(m,p),limit=Math.max(m.maxX-m.minX+1,m.maxY-m.minY+1)*ratio;if(d<=limit){m.minX=Math.min(m.minX,p.minX);m.minY=Math.min(m.minY,p.minY);m.maxX=Math.max(m.maxX,p.maxX);m.maxY=Math.max(m.maxY,p.maxY)}}return m}
function gap(a,b){const dx=Math.max(0,Math.max(a.minX-b.maxX,b.minX-a.maxX)),dy=Math.max(0,Math.max(a.minY-b.maxY,b.minY-a.maxY));return Math.hypot(dx,dy)}
function realTransparency(d,a){let n=0;for(let i=3;i<d.length;i+=4)if(d[i]<250)n++;return n>Math.max(20,d.length/4*.001)}
function removeBorderBackground(imageData,w,h,tol){const data=imageData.data,bg=borderColor(data,w,h),seen=new Uint8Array(w*h),q=new Int32Array(w*h);let head=0,tail=0;const add=(x,y)=>{if(x<0||y<0||x>=w||y>=h)return;const p=y*w+x;if(seen[p]||colorDist(data,p,bg)>tol)return;seen[p]=1;q[tail++]=p};for(let x=0;x<w;x++){add(x,0);add(x,h-1)}for(let y=0;y<h;y++){add(0,y);add(w-1,y)}while(head<tail){const p=q[head++],x=p%w,y=Math.floor(p/w);add(x+1,y);add(x-1,y);add(x,y+1);add(x,y-1)}for(let p=0;p<seen.length;p++)if(seen[p])data[p*4+3]=0}
function borderColor(data,w,h){const s=[],sx=Math.max(1,Math.floor(w/30)),sy=Math.max(1,Math.floor(h/30)),push=(x,y)=>{const i=(y*w+x)*4;s.push([data[i],data[i+1],data[i+2]])};for(let x=0;x<w;x+=sx){push(x,0);push(x,h-1)}for(let y=0;y<h;y+=sy){push(0,y);push(w-1,y)}return[0,1,2].map(k=>{const a=s.map(v=>v[k]).sort((x,y)=>x-y);return a[Math.floor(a.length/2)]})}
function colorDist(data,p,bg){const i=p*4;return Math.hypot(data[i]-bg[0],data[i+1]-bg[1],data[i+2]-bg[2])}
function clampRect(r,w,h){const x=Math.max(0,Math.round(r.x)),y=Math.max(0,Math.round(r.y)),right=Math.min(w,Math.round(r.x+r.w)),bottom=Math.min(h,Math.round(r.y+r.h));return{x,y,w:Math.max(1,right-x),h:Math.max(1,bottom-y)}}
function crop(src,r){const c=document.createElement("canvas");c.width=Math.max(1,Math.round(r.w));c.height=Math.max(1,Math.round(r.h));c.getContext("2d").drawImage(src,Math.round(r.x),Math.round(r.y),c.width,c.height,0,0,c.width,c.height);return c}

function renderResults(){
  $("resultCount").textContent=`${results.length}개`;resultGrid.innerHTML="";
  results.forEach(item=>{const card=document.createElement("article");card.className=`card${item.selected?" selected":""}`;const badge=item.compliance.ok?`<span class="badge ok">규정 통과</span>`:`<span class="badge warn">${esc(item.compliance.reasons.join(", "))}</span>`;card.innerHTML=`<input type="checkbox" ${item.selected?"checked":""}><div class="checker"><img src="${item.url}"></div><div class="info"><strong>${esc(item.filename)}</strong><small>${item.width}×${item.height}px · ${item.dpi}dpi · ${size(item.size)}</small>${badge}</div>`;card.querySelector("input").onchange=e=>{item.selected=e.target.checked;renderResults()};resultGrid.appendChild(card)});
  const n=results.filter(x=>x.selected).length;$("downloadFiles").disabled=!n;$("downloadZip").disabled=!n;
}
$("resultAll").onclick=()=>{results.forEach(x=>x.selected=true);renderResults()};$("resultNone").onclick=()=>{results.forEach(x=>x.selected=false);renderResults()};
$("downloadFiles").onclick=()=>results.filter(x=>x.selected).forEach((x,i)=>setTimeout(()=>download(x.blob,x.filename),i*200));
$("downloadZip").onclick=async()=>{const sel=results.filter(x=>x.selected);if(!sel.length)return;const zip=new JSZip();sel.forEach(x=>zip.file(x.filename,x.blob));download(await zip.generateAsync({type:"blob",compression:"DEFLATE"}),"miricanvas_cropped.zip")};
$("reset").onclick=()=>{sources.forEach(x=>URL.revokeObjectURL(x.url));clearResults();sources=[];renderSources();renderResults();resultPanel.classList.add("hidden");status.textContent="이미지를 추가해주세요."};

function clearResults(){results.forEach(x=>URL.revokeObjectURL(x.url));results=[]}
function imageCanvas(img){const c=document.createElement("canvas");c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext("2d",{willReadFrequently:true}).drawImage(img,0,0);return c}
function loadImage(file){return new Promise((res,rej)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{URL.revokeObjectURL(url);res(img)};img.onerror=()=>rej(new Error("이미지를 열 수 없습니다."));img.src=url})}
function canvasBlob(c){return new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error("PNG 생성 실패")),"image/png"))}
async function addDpi(blob,dpi){return blob}
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000)}
function size(n){return n<1048576?`${(n/1024).toFixed(0)}KB`:`${(n/1048576).toFixed(1)}MB`}
function esc(s){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
