const $=id=>document.getElementById(id);
const fileInput=$("fileInput"),dropZone=$("dropZone"),gridSelect=$("gridSelect"),gridMode=$("gridMode");
const assetType=$("assetType"),cropMode=$("cropMode"),marginInput=$("marginInput"),dpiSelect=$("dpiSelect"),sizeSelect=$("sizeSelect");
const removeBg=$("removeBg"),rulesMode=$("rulesMode"),tolerance=$("tolerance"),mergeDistance=$("mergeDistance"),alphaThreshold=$("alphaThreshold");
const sourceGrid=$("sourceGrid"),resultGrid=$("resultGrid"),resultPanel=$("resultPanel"),status=$("status");
let sources=[],results=[];

[["tolerance","toleranceOut",""],["mergeDistance","mergeOut","%"],["alphaThreshold","alphaOut",""]].forEach(([i,o,s])=>{
  $(i).addEventListener("input",()=>$(o).textContent=$(i).value+s);
});

fileInput.addEventListener("change",()=>addFiles(fileInput.files));
$("addFiles").addEventListener("click",()=>fileInput.click());
["dragenter","dragover"].forEach(n=>dropZone.addEventListener(n,e=>{e.preventDefault();dropZone.classList.add("over")}));
["dragleave","drop"].forEach(n=>dropZone.addEventListener(n,e=>{e.preventDefault();dropZone.classList.remove("over")}));
dropZone.addEventListener("drop",e=>addFiles(e.dataTransfer.files));

function addFiles(files){
  [...files].forEach(file=>{
    if(!["image/png","image/jpeg","image/webp"].includes(file.type))return;
    sources.push({id:crypto.randomUUID(),file,url:URL.createObjectURL(file),selected:true});
  });
  fileInput.value="";
  renderSources();
  status.textContent=`${sources.length}장의 이미지를 준비했습니다.`;
}
function renderSources(){
  $("sourceCount").textContent=`${sources.length}장`;
  if(!sources.length){sourceGrid.className="grid empty";sourceGrid.textContent="이미지를 추가하면 미리보기가 표시됩니다.";return}
  sourceGrid.className="grid";sourceGrid.innerHTML="";
  sources.forEach(item=>{
    const card=document.createElement("article");card.className=`card${item.selected?" selected":""}`;
    card.innerHTML=`<input type="checkbox" ${item.selected?"checked":""}><div class="checker"><img src="${item.url}"></div><div class="info"><strong>${escapeHtml(item.file.name)}</strong><small>${formatSize(item.file.size)}</small></div>`;
    card.querySelector("input").onchange=e=>{item.selected=e.target.checked;renderSources()};
    sourceGrid.appendChild(card);
  });
}
$("sourceAll").onclick=()=>{sources.forEach(x=>x.selected=true);renderSources()};
$("sourceNone").onclick=()=>{sources.forEach(x=>x.selected=false);renderSources()};
$("sourceDelete").onclick=()=>{sources.filter(x=>x.selected).forEach(x=>URL.revokeObjectURL(x.url));sources=sources.filter(x=>!x.selected);renderSources()};

$("process").onclick=async()=>{
  const targets=sources.filter(x=>x.selected);if(!targets.length)return alert("처리할 이미지를 선택해주세요.");
  $("process").disabled=true;clearResults();
  try{
    const n=Number(gridSelect.value),margin=Math.max(0,Number(marginInput.value)||0),tol=Number(tolerance.value),merge=Number(mergeDistance.value)/100,alpha=Number(alphaThreshold.value);
    const total=targets.length*n*n;let done=0;
    for(const src of targets){
      const img=await loadImage(src.file),canvas=imageToCanvas(img);
      const boundaries=getGridBoundaries(canvas,n,gridMode.value,tol,alpha);
      for(let r=0;r<n;r++)for(let c=0;c<n;c++){
        done++;status.textContent=`${done}/${total} 처리 중...`;
        const cell=extractRect(canvas,boundaries.x[c],boundaries.y[r],boundaries.x[c+1]-boundaries.x[c],boundaries.y[r+1]-boundaries.y[r]);
        let out=trimCell(cell,{margin,tol,merge,alpha,mode:cropMode.value,removeBg:removeBg.checked});
        const required=getRequiredMin();
        if(rulesMode.checked)out=normalizeSize(out,required,9800);
        const raw=await canvasToBlob(out),blob=await addDpi(raw,Number(dpiSelect.value));
        const base=src.file.name.replace(/\.[^.]+$/,""),index=r*n+c+1,filename=`${base}_element_${String(index).padStart(2,"0")}.png`;
        const compliance=checkCompliance(out.width,out.height,blob.size,required);
        results.push({id:crypto.randomUUID(),filename,blob,url:URL.createObjectURL(blob),width:out.width,height:out.height,size:blob.size,dpi:Number(dpiSelect.value),selected:true,compliance});
      }
    }
    renderResults();resultPanel.classList.remove("hidden");
    status.textContent=`완료: ${results.length}개 생성`;
  }catch(e){console.error(e);alert(e.message||"처리 오류");status.textContent="처리 중 오류가 발생했습니다."}
  finally{$("process").disabled=false}
};

function getGridBoundaries(canvas,n,mode,tol,alpha){
  const xs=Array.from({length:n+1},(_,i)=>Math.round(i*canvas.width/n));
  const ys=Array.from({length:n+1},(_,i)=>Math.round(i*canvas.height/n));
  if(mode==="fixed"||n===1)return{x:xs,y:ys};
  const mask=makeForegroundMask(canvas,tol,alpha,false);
  const col=new Float64Array(canvas.width),row=new Float64Array(canvas.height);
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(mask[y*canvas.width+x]){col[x]++;row[y]++}
  smoothArray(col,Math.max(3,Math.round(canvas.width/200)));smoothArray(row,Math.max(3,Math.round(canvas.height/200)));
  for(let k=1;k<n;k++){xs[k]=findValley(col,k*canvas.width/n,canvas.width/n*.22);ys[k]=findValley(row,k*canvas.height/n,canvas.height/n*.22)}
  xs.sort((a,b)=>a-b);ys.sort((a,b)=>a-b);xs[0]=0;xs[n]=canvas.width;ys[0]=0;ys[n]=canvas.height;
  return{x:xs,y:ys};
}
function findValley(arr,center,radius){
  let from=Math.max(1,Math.floor(center-radius)),to=Math.min(arr.length-2,Math.ceil(center+radius)),best=Math.round(center),score=Infinity;
  for(let i=from;i<=to;i++){const s=arr[i]+Math.abs(i-center)*.02;if(s<score){score=s;best=i}}
  return best;
}
function smoothArray(arr,r){
  const copy=Float64Array.from(arr);let sum=0;
  for(let i=0;i<arr.length;i++){sum+=copy[i];if(i-r-1>=0)sum-=copy[i-r-1];arr[i]=sum/Math.min(i+1,r+1)}
}

function trimCell(canvas,opt){
  const ctx=canvas.getContext("2d",{willReadFrequently:true}),data=ctx.getImageData(0,0,canvas.width,canvas.height);
  if(opt.removeBg&&!hasTransparency(data.data,opt.alpha))floodBackground(data,canvas.width,canvas.height,opt.tol);
  const mask=alphaMask(data.data,canvas.width,canvas.height,opt.alpha);
  const comps=components(mask,canvas.width,canvas.height);
  let box=mergeComponents(comps,canvas.width,canvas.height,opt.merge)||bboxFromMask(mask,canvas.width,canvas.height);
  if(!box)return canvas;
  const masked=document.createElement("canvas");masked.width=canvas.width;masked.height=canvas.height;masked.getContext("2d").putImageData(data,0,0);
  const long=Math.max(box.maxX-box.minX+1,box.maxY-box.minY+1);
  let m=Math.max(opt.margin,Math.round(long*.015));
  if(opt.mode==="safe")m=Math.max(m,Math.round(long*.035));
  if(opt.mode==="tight")m=Math.min(m,Math.max(2,Math.round(long*.006)));
  let rect={x:box.minX-m,y:box.minY-m,w:box.maxX-box.minX+1+m*2,h:box.maxY-box.minY+1+m*2};
  rect=clampRect(rect,masked.width,masked.height);
  let out=extractRect(masked,rect.x,rect.y,rect.w,rect.h);
  // 두 번째 패스: 결과 자체의 알파 경계를 다시 계산하여 세로/가로를 각각 재트림
  const octx=out.getContext("2d",{willReadFrequently:true}),odata=octx.getImageData(0,0,out.width,out.height);
  const obox=findAlphaBox(odata.data,out.width,out.height,opt.alpha);
  if(obox){
    const m2=Math.max(opt.mode==="tight"?2:Math.min(opt.margin,12),2);
    const r2=clampRect({x:obox.minX-m2,y:obox.minY-m2,w:obox.maxX-obox.minX+1+m2*2,h:obox.maxY-obox.minY+1+m2*2},out.width,out.height);
    out=extractRect(out,r2.x,r2.y,r2.w,r2.h);
  }
  return out;
}

function makeForegroundMask(canvas,tol,alpha,remove){
  const ctx=canvas.getContext("2d",{willReadFrequently:true}),d=ctx.getImageData(0,0,canvas.width,canvas.height);
  if(remove&&!hasTransparency(d.data,alpha))floodBackground(d,canvas.width,canvas.height,tol);
  if(hasTransparency(d.data,alpha))return alphaMask(d.data,canvas.width,canvas.height,alpha);
  const bg=borderColor(d.data,canvas.width,canvas.height),m=new Uint8Array(canvas.width*canvas.height);
  for(let p=0;p<m.length;p++)m[p]=colorDistance(d.data,p,bg)>tol?1:0;
  return m;
}
function hasTransparency(data,alpha){let c=0;for(let i=3;i<data.length;i+=4)if(data[i]<250)c++;return c>Math.max(20,data.length/4*.001)}
function alphaMask(data,w,h,a){const m=new Uint8Array(w*h);for(let p=0;p<m.length;p++)if(data[p*4+3]>a)m[p]=1;return m}
function findAlphaBox(data,w,h,a){return bboxFromMask(alphaMask(data,w,h,a),w,h)}
function bboxFromMask(m,w,h){let minX=w,minY=h,maxX=-1,maxY=-1;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(m[y*w+x]){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y)}return maxX<0?null:{minX,minY,maxX,maxY}}
function components(mask,w,h){
  const seen=new Uint8Array(w*h),out=[],q=new Int32Array(w*h);
  for(let s=0;s<w*h;s++){if(seen[s]||!mask[s])continue;let head=0,tail=0;q[tail++]=s;seen[s]=1;let minX=w,minY=h,maxX=-1,maxY=-1,area=0;
    while(head<tail){const p=q[head++],x=p%w,y=Math.floor(p/w);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);area++;
      for(const [nx,ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1],[x+1,y+1],[x-1,y-1],[x+1,y-1],[x-1,y+1]]){if(nx<0||ny<0||nx>=w||ny>=h)continue;const np=ny*w+nx;if(!seen[np]&&mask[np]){seen[np]=1;q[tail++]=np}}
    }out.push({minX,minY,maxX,maxY,area});
  }return out;
}
function mergeComponents(comps,w,h,ratio){
  if(!comps.length)return null;const arr=[...comps].sort((a,b)=>b.area-a.area),noise=w*h*.00005;let m={...arr[0]};
  for(const c of arr.slice(1)){if(c.area<noise)continue;const d=rectGap(m,c),limit=Math.max(m.maxX-m.minX+1,m.maxY-m.minY+1)*ratio;if(d<=limit){m.minX=Math.min(m.minX,c.minX);m.minY=Math.min(m.minY,c.minY);m.maxX=Math.max(m.maxX,c.maxX);m.maxY=Math.max(m.maxY,c.maxY);m.area+=c.area}}
  return m;
}
function rectGap(a,b){const dx=Math.max(0,Math.max(a.minX-b.maxX,b.minX-a.maxX)),dy=Math.max(0,Math.max(a.minY-b.maxY,b.minY-a.maxY));return Math.hypot(dx,dy)}
function floodBackground(d,w,h,tol){
  const data=d.data,bg=borderColor(data,w,h),seen=new Uint8Array(w*h),q=new Int32Array(w*h);let head=0,tail=0;
  const add=(x,y)=>{if(x<0||y<0||x>=w||y>=h)return;const p=y*w+x;if(seen[p]||colorDistance(data,p,bg)>tol)return;seen[p]=1;q[tail++]=p};
  for(let x=0;x<w;x++){add(x,0);add(x,h-1)}for(let y=0;y<h;y++){add(0,y);add(w-1,y)}
  while(head<tail){const p=q[head++],x=p%w,y=Math.floor(p/w);add(x+1,y);add(x-1,y);add(x,y+1);add(x,y-1)}
  for(let p=0;p<seen.length;p++)if(seen[p])data[p*4+3]=0;
}
function borderColor(data,w,h){
  const s=[],sx=Math.max(1,Math.floor(w/30)),sy=Math.max(1,Math.floor(h/30)),push=(x,y)=>{const i=(y*w+x)*4;s.push([data[i],data[i+1],data[i+2]])};
  for(let x=0;x<w;x+=sx){push(x,0);push(x,h-1)}for(let y=0;y<h;y+=sy){push(0,y);push(w-1,y)}
  return [0,1,2].map(k=>{const a=s.map(v=>v[k]).sort((a,b)=>a-b);return a[Math.floor(a.length/2)]});
}
function colorDistance(data,p,bg){const i=p*4,dr=data[i]-bg[0],dg=data[i+1]-bg[1],db=data[i+2]-bg[2];return Math.hypot(dr,dg,db)}
function clampRect(r,w,h){const x=Math.max(0,Math.round(r.x)),y=Math.max(0,Math.round(r.y)),right=Math.min(w,Math.round(r.x+r.w)),bottom=Math.min(h,Math.round(r.y+r.h));return{x,y,w:Math.max(1,right-x),h:Math.max(1,bottom-y)}}
function extractRect(src,x,y,w,h){const c=document.createElement("canvas");c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));c.getContext("2d").drawImage(src,Math.round(x),Math.round(y),c.width,c.height,0,0,c.width,c.height);return c}

function getRequiredMin(){if(sizeSelect.value!=="auto")return Number(sizeSelect.value);return assetType.value==="icon"?700:1500}
function normalizeSize(c,min,max){const mn=Math.min(c.width,c.height),mx=Math.max(c.width,c.height);let s=mn<min?min/mn:1;if(mx*s>max)s=max/mx;if(Math.abs(s-1)<.001)return c;const o=document.createElement("canvas");o.width=Math.round(c.width*s);o.height=Math.round(c.height*s);const ctx=o.getContext("2d");ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";ctx.drawImage(c,0,0,o.width,o.height);return o}
function checkCompliance(w,h,bytes,min){const reasons=[];if(Math.min(w,h)<min)reasons.push(`최소 ${min}px 미달`);if(Math.max(w,h)>9800)reasons.push("9800px 초과");if(bytes>50*1024*1024)reasons.push("50MB 초과");return{ok:!reasons.length,reasons}}

function renderResults(){
  $("resultCount").textContent=`${results.length}개`;resultGrid.innerHTML="";
  results.forEach(item=>{
    const card=document.createElement("article");card.className=`card${item.selected?" selected":""}`;
    const badge=item.compliance.ok?`<span class="badge ok">규정 통과</span>`:`<span class="badge warn">${escapeHtml(item.compliance.reasons.join(", "))}</span>`;
    card.innerHTML=`<input type="checkbox" ${item.selected?"checked":""}><div class="checker"><img src="${item.url}"></div><div class="info"><strong>${escapeHtml(item.filename)}</strong><small>${item.width}×${item.height}px · ${item.dpi}dpi · ${formatSize(item.size)}</small>${badge}</div>`;
    card.querySelector("input").onchange=e=>{item.selected=e.target.checked;renderResults()};resultGrid.appendChild(card);
  });
  const n=results.filter(x=>x.selected).length;$("downloadFiles").disabled=!n;$("downloadZip").disabled=!n;
}
$("resultAll").onclick=()=>{results.forEach(x=>x.selected=true);renderResults()};
$("resultNone").onclick=()=>{results.forEach(x=>x.selected=false);renderResults()};
$("downloadFiles").onclick=()=>results.filter(x=>x.selected).forEach((x,i)=>setTimeout(()=>downloadBlob(x.blob,x.filename),i*200));
$("downloadZip").onclick=async()=>{
  const sel=results.filter(x=>x.selected);if(!sel.length)return;
  const zip=new JSZip();sel.forEach(x=>zip.file(x.filename,x.blob));
  zip.file("miricanvas_report.txt",sel.map(x=>`${x.filename}\t${x.width}x${x.height}\t${x.dpi}dpi\t${formatSize(x.size)}\t${x.compliance.ok?"통과":x.compliance.reasons.join(", ")}`).join("\n"));
  downloadBlob(await zip.generateAsync({type:"blob",compression:"DEFLATE"}),"miricanvas_cropped.zip");
};
$("reset").onclick=()=>{sources.forEach(x=>URL.revokeObjectURL(x.url));clearResults();sources=[];renderSources();renderResults();resultPanel.classList.add("hidden");status.textContent="이미지를 추가해주세요."};

function clearResults(){results.forEach(x=>URL.revokeObjectURL(x.url));results=[]}
function imageToCanvas(img){const c=document.createElement("canvas");c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext("2d",{willReadFrequently:true}).drawImage(img,0,0);return c}
function loadImage(file){return new Promise((res,rej)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{URL.revokeObjectURL(url);res(img)};img.onerror=()=>rej(new Error("이미지를 열 수 없습니다."));img.src=url})}
function canvasToBlob(c){return new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error("PNG 생성 실패")),"image/png"))}
async function addDpi(blob,dpi){const b=new Uint8Array(await blob.arrayBuffer());if(b.length<33)return blob;const ppm=Math.round(dpi/.0254),data=new Uint8Array(9);write32(data,0,ppm);write32(data,4,ppm);data[8]=1;const type=new TextEncoder().encode("pHYs"),crcIn=new Uint8Array(13);crcIn.set(type);crcIn.set(data,4);const chunk=new Uint8Array(21);write32(chunk,0,9);chunk.set(type,4);chunk.set(data,8);write32(chunk,17,crc32(crcIn));const out=new Uint8Array(b.length+21);out.set(b.slice(0,33));out.set(chunk,33);out.set(b.slice(33),54);return new Blob([out],{type:"image/png"})}
function write32(a,o,v){a[o]=v>>>24;a[o+1]=v>>>16;a[o+2]=v>>>8;a[o+3]=v}
function crc32(bytes){let c=0xffffffff;for(const x of bytes){c^=x;for(let i=0;i<8;i++)c=(c>>>1)^(0xedb88320&-(c&1))}return(c^0xffffffff)>>>0}
function downloadBlob(blob,name){const u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000)}
function formatSize(n){return n<1048576?`${(n/1024).toFixed(0)}KB`:`${(n/1048576).toFixed(1)}MB`}
function escapeHtml(s){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
