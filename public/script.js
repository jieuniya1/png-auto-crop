const $=id=>document.getElementById(id);
const fileInput=$("fileInput"),dropZone=$("dropZone"),gridSelect=$("gridSelect"),marginInput=$("marginInput"),toleranceInput=$("toleranceInput"),toleranceValue=$("toleranceValue"),removeBackground=$("removeBackground");
const sourceGrid=$("sourceGrid"),resultGrid=$("resultGrid"),resultPanel=$("resultPanel"),status=$("status");
let sources=[],results=[],directoryHandle=null;

toleranceInput.oninput=()=>toleranceValue.textContent=toleranceInput.value;
fileInput.onchange=()=>addFiles(fileInput.files);
$("addFilesButton").onclick=()=>fileInput.click();
["dragenter","dragover"].forEach(n=>dropZone.addEventListener(n,e=>{e.preventDefault();dropZone.classList.add("dragover")}));
["dragleave","drop"].forEach(n=>dropZone.addEventListener(n,e=>{e.preventDefault();dropZone.classList.remove("dragover")}));
dropZone.ondrop=e=>addFiles(e.dataTransfer.files);

function addFiles(list){
  [...list].forEach(file=>{
    if(!["image/png","image/jpeg","image/webp"].includes(file.type))return;
    sources.push({id:crypto.randomUUID(),file,url:URL.createObjectURL(file),selected:true});
  });
  fileInput.value="";renderSources();status.textContent=`${sources.length}장의 이미지를 준비했습니다.`;
}
function card(item,isResult){
  const el=document.createElement("article");el.className=`card${item.selected?" selected":""}`;
  const check=document.createElement("input");check.type="checkbox";check.className="check";check.checked=item.selected;
  check.onchange=()=>{item.selected=check.checked;isResult?renderResults():renderSources()};
  const wrap=document.createElement("div");wrap.className="image-wrap";
  const img=document.createElement("img");img.src=item.url;wrap.appendChild(img);
  const info=document.createElement("div");info.className="info";
  info.innerHTML=`<strong>${escapeHtml(isResult?item.filename:item.file.name)}</strong><small>${isResult?`${item.width}×${item.height}px`:formatSize(item.file.size)}</small>`;
  el.append(check,wrap,info);return el;
}
function renderSources(){
  $("uploadCount").textContent=`${sources.length}장`;
  if(!sources.length){sourceGrid.className="grid empty";sourceGrid.textContent="이미지를 추가하면 미리보기가 표시됩니다.";return}
  sourceGrid.className="grid";sourceGrid.innerHTML="";sources.forEach(i=>sourceGrid.appendChild(card(i,false)));
}
function renderResults(){
  $("resultCount").textContent=`${results.length}개`;resultGrid.innerHTML="";
  results.forEach(i=>resultGrid.appendChild(card(i,true)));
  const count=results.filter(i=>i.selected).length;
  $("downloadSelectedButton").disabled=!count;$("downloadZipButton").disabled=!count;
}
$("sourceSelectAll").onclick=()=>{sources.forEach(i=>i.selected=true);renderSources()};
$("sourceClearAll").onclick=()=>{sources.forEach(i=>i.selected=false);renderSources()};
$("deleteSelectedSources").onclick=()=>{sources.filter(i=>i.selected).forEach(i=>URL.revokeObjectURL(i.url));sources=sources.filter(i=>!i.selected);renderSources()};
$("resultSelectAll").onclick=()=>{results.forEach(i=>i.selected=true);renderResults()};
$("resultClearAll").onclick=()=>{results.forEach(i=>i.selected=false);renderResults()};

$("processButton").onclick=async()=>{
  const targets=sources.filter(i=>i.selected);if(!targets.length)return alert("처리할 이미지를 체크해주세요.");
  $("processButton").disabled=true;results.forEach(i=>URL.revokeObjectURL(i.url));results=[];
  try{
    const grid=+gridSelect.value,margin=Math.max(0,Math.min(100,+marginInput.value||0)),tolerance=+toleranceInput.value;
    let done=0,total=targets.length*grid*grid;
    for(const s of targets){
      const img=await loadImage(s.file),src=imageToCanvas(img);
      for(let r=0;r<grid;r++)for(let c=0;c<grid;c++){
        status.textContent=`${++done}/${total} 요소 처리 중...`;
        const out=processCell(extractCell(src,r,c,grid),margin,tolerance,removeBackground.checked);
        const blob=await canvasToBlob(out),base=s.file.name.replace(/\.[^.]+$/,""),idx=r*grid+c+1;
        results.push({id:crypto.randomUUID(),filename:`${base}_element_${String(idx).padStart(2,"0")}.png`,blob,url:URL.createObjectURL(blob),width:out.width,height:out.height,selected:true});
      }
    }
    renderResults();resultPanel.classList.remove("hidden");status.textContent=`완료: PNG ${results.length}개를 생성했습니다.`;
  }catch(e){console.error(e);alert(e.message);status.textContent="처리 중 오류가 발생했습니다."}finally{$("processButton").disabled=false}
};
function imageToCanvas(img){const c=document.createElement("canvas");c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext("2d",{willReadFrequently:true}).drawImage(img,0,0);return c}
function extractCell(src,r,c,g){const x1=Math.floor(c*src.width/g),x2=Math.floor((c+1)*src.width/g),y1=Math.floor(r*src.height/g),y2=Math.floor((r+1)*src.height/g),o=document.createElement("canvas");o.width=x2-x1;o.height=y2-y1;o.getContext("2d",{willReadFrequently:true}).drawImage(src,x1,y1,o.width,o.height,0,0,o.width,o.height);return o}
function processCell(cell,margin,tolerance,removeBg){
  const ctx=cell.getContext("2d",{willReadFrequently:true}),data=ctx.getImageData(0,0,cell.width,cell.height);
  if(removeBg&&!hasTransparency(data.data))floodRemove(data,cell.width,cell.height,tolerance);
  const b=findBox(data.data,cell.width,cell.height);if(!b)return cell;
  const masked=document.createElement("canvas");masked.width=cell.width;masked.height=cell.height;masked.getContext("2d").putImageData(data,0,0);
  const x1=Math.max(0,b.minX-margin),y1=Math.max(0,b.minY-margin),x2=Math.min(cell.width-1,b.maxX+margin),y2=Math.min(cell.height-1,b.maxY+margin);
  const o=document.createElement("canvas");o.width=Math.max(1,x2-x1+1);o.height=Math.max(1,y2-y1+1);o.getContext("2d").drawImage(masked,x1,y1,o.width,o.height,0,0,o.width,o.height);return o
}
function hasTransparency(d){let n=0;for(let i=3;i<d.length;i+=4)if(d[i]<250)n++;return n>Math.max(20,d.length/4000)}
function floodRemove(img,w,h,tol){
  const d=img.data,bg=borderColor(d,w,h),vis=new Uint8Array(w*h),q=new Int32Array(w*h);let head=0,tail=0;
  const add=(x,y)=>{if(x<0||y<0||x>=w||y>=h)return;const p=y*w+x;if(vis[p]||!close(d,p,bg,tol))return;vis[p]=1;q[tail++]=p};
  for(let x=0;x<w;x++){add(x,0);add(x,h-1)}for(let y=0;y<h;y++){add(0,y);add(w-1,y)}
  while(head<tail){const p=q[head++],x=p%w,y=Math.floor(p/w);add(x+1,y);add(x-1,y);add(x,y+1);add(x,y-1)}
  for(let p=0;p<vis.length;p++)if(vis[p])d[p*4+3]=0
}
function borderColor(d,w,h){const s=[],sx=Math.max(1,Math.floor(w/24)),sy=Math.max(1,Math.floor(h/24)),take=(x,y)=>{const i=(y*w+x)*4;s.push([d[i],d[i+1],d[i+2]])};for(let x=0;x<w;x+=sx){take(x,0);take(x,h-1)}for(let y=0;y<h;y+=sy){take(0,y);take(w-1,y)}const med=k=>s.map(v=>v[k]).sort((a,b)=>a-b)[Math.floor(s.length/2)];return[med(0),med(1),med(2)]}
function close(d,p,b,t){const i=p*4,dr=d[i]-b[0],dg=d[i+1]-b[1],db=d[i+2]-b[2];return Math.sqrt(dr*dr+dg*dg+db*db)<=t}
function findBox(d,w,h){let minX=w,minY=h,maxX=-1,maxY=-1;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(d[(y*w+x)*4+3]>12){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y)}return maxX<0?null:{minX,minY,maxX,maxY}}
$("downloadSelectedButton").onclick=async()=>{const sel=results.filter(i=>i.selected);if(directoryHandle){for(const i of sel){const h=await directoryHandle.getFileHandle(i.filename,{create:true}),w=await h.createWritable();await w.write(i.blob);await w.close()}status.textContent=`${sel.length}개 저장 완료`;return}sel.forEach((i,n)=>setTimeout(()=>downloadBlob(i.blob,i.filename),n*250))};
$("downloadZipButton").onclick=async()=>{const sel=results.filter(i=>i.selected);if(!sel.length)return;const z=new JSZip();sel.forEach(i=>z.file(i.filename,i.blob));downloadBlob(await z.generateAsync({type:"blob"}),"cropped_selected.zip")};
$("chooseFolderButton").onclick=async()=>{if(!window.showDirectoryPicker)return alert("Chrome 또는 Edge에서 지원됩니다.");try{directoryHandle=await window.showDirectoryPicker();$("chooseFolderButton").textContent="📁 저장 폴더 선택됨"}catch(e){}};
$("resetButton").onclick=()=>{sources.forEach(i=>URL.revokeObjectURL(i.url));results.forEach(i=>URL.revokeObjectURL(i.url));sources=[];results=[];directoryHandle=null;renderSources();renderResults();resultPanel.classList.add("hidden");status.textContent="이미지를 추가해주세요."};
function loadImage(file){return new Promise((res,rej)=>{const i=new Image(),u=URL.createObjectURL(file);i.onload=()=>{URL.revokeObjectURL(u);res(i)};i.onerror=()=>rej(new Error("이미지를 열 수 없습니다."));i.src=u})}
function canvasToBlob(c){return new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error("PNG 생성 실패")),"image/png"))}
function downloadBlob(b,n){const u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=n;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1200)}
function formatSize(b){return b<1048576?`${(b/1024).toFixed(0)}KB`:`${(b/1048576).toFixed(1)}MB`}
function escapeHtml(v){return v.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}