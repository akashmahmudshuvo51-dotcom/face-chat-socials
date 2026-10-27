import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, where, orderBy, limit, onSnapshot,
  serverTimestamp, Timestamp, runTransaction, documentId
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCk8NkG9i-zFDzUZxKgq_a0kAVHDK1jh8",
  authDomain: "face-chat-social.firebaseapp.com",
  projectId: "face-chat-social",
  storageBucket: "face-chat-social.firebasestorage.app",
  messagingSenderId: "874009862385",
  appId: "1:874009862385:web:b17cad69afa29575040950",
  measurementId: "G-XL0K5S4YEG"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const $ = id => document.getElementById(id);
let user = null, signupMode = false, stopFeed = null, stopRequests = null;
let stopChats = null, stopStories = null, stopChatMessages = null;
let currentChat = null, friendRecords = [], adminMode = false;
const unsubscribers = [];
const MAX_MEDIA = 20 * 1024 * 1024;

function escapeHTML(v="") {
  return String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function message(id, text="", kind="") {
  const el=$(id); if(!el) return;
  el.textContent=text; el.className="message"+(kind?" "+kind:"");
}
function errorText(e) {
  const map={
    "auth/email-already-in-use":"This email already has an account.",
    "auth/invalid-email":"Please enter a valid email.",
    "auth/weak-password":"Password must be at least 6 characters.",
    "auth/invalid-credential":"Email or password is incorrect.",
    "auth/too-many-requests":"Too many attempts. Try again later.",
    "permission-denied":"Firebase denied this action. Check the Firestore/Storage rules.",
    "storage/unauthorized":"Upload denied by Storage rules.",
    "storage/canceled":"Upload canceled."
  };
  return map[e?.code] || e?.message || "Something went wrong.";
}
function displayName(u=user) { return u?.displayName || u?.email?.split("@")[0] || "Face-Chat user"; }
function avatarHTML(name, photo="") {
  if(photo && /^https:\/\//i.test(photo)) return `<img class="avatar" src="${escapeHTML(photo)}" alt="">`;
  return `<div class="avatar">${escapeHTML((name||"F").trim().charAt(0).toUpperCase()||"F")}</div>`;
}
function formatTime(ts) {
  try { return ts?.toDate ? ts.toDate().toLocaleString() : "Just now"; } catch { return "Just now"; }
}
function setHidden(id, hidden) { $(id).classList.toggle("hidden", hidden); }
function stopAll() {
  for (const fn of [stopFeed,stopRequests,stopChats,stopStories,stopChatMessages]) { if(fn) { try{fn();}catch{} } }
  stopFeed=stopRequests=stopChats=stopStories=stopChatMessages=null;
}
function switchView(view) {
  document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));
  const target=$("view-"+view); if(target) target.classList.remove("hidden");
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  if(view==="friends") loadFriends();
  if(view==="messages") loadChatContacts();
  if(view==="stories") loadStories();
  if(view==="admin") loadAdmin();
}
document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>switchView(b.dataset.view)));
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>switchView(b.dataset.go)));

$("authModeBtn").onclick=()=>{
  signupMode=!signupMode;
  setHidden("nameFieldWrap",!signupMode);
  $("authHeading").textContent=signupMode?"Create your account":"Log in";
  $("authSubmit").textContent=signupMode?"Create account":"Log in";
  $("authModeBtn").textContent=signupMode?"I already have an account":"Create new account";
  $("authPassword").autocomplete=signupMode?"new-password":"current-password";
  message("authError");
};
$("authForm").addEventListener("submit",async e=>{
  e.preventDefault(); message("authError");
  const email=$("authEmail").value.trim(), password=$("authPassword").value;
  try {
    if(signupMode){
      const name=$("authName").value.trim();
      if(!name) throw Error("Please enter your name.");
      const result=await createUserWithEmailAndPassword(auth,email,password);
      await updateProfile(result.user,{displayName:name});
      await setDoc(doc(db,"users",result.user.uid),{
        uid:result.user.uid,displayName:name,email:email,bio:"",photoURL:"",
        createdAt:serverTimestamp()
      });
    } else {
      await signInWithEmailAndPassword(auth,email,password);
    }
  } catch(e){message("authError",errorText(e),"error");}
});
$("logoutBtn").onclick=()=>signOut(auth);

async function uploadMedia(file, folder) {
  if(!file) return "";
  if(file.size>MAX_MEDIA) throw Error("File is too large. Maximum size is 20 MB.");
  if(!file.type.startsWith("image/")&&!file.type.startsWith("video/")) throw Error("Choose an image or video file.");
  const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-100);
  const path=`${folder}/${user.uid}/${Date.now()}_${safeName}`;
  const target=ref(storage,path);
  await uploadBytes(target,file,{contentType:file.type});
  return await getDownloadURL(target);
}
$("postFile").addEventListener("change",()=>{$("postFileName").textContent=$("postFile").files[0]?.name||"Optional, max 20 MB";});
$("postForm").addEventListener("submit",async e=>{
  e.preventDefault(); message("postError");
  const text=$("postText").value.trim(), file=$("postFile").files[0];
  if(!text&&!file){message("postError","Write something or select a photo/video.","error");return;}
  const btn=$("postForm").querySelector('button[type="submit"]'); btn.disabled=true;
  try {
    const mediaURL=file?await uploadMedia(file,"posts"):"";
    await addDoc(collection(db,"posts"),{
      uid:user.uid,authorName:displayName(),authorPhoto:user.photoURL||"",
      text,mediaURL,mediaType:file?.type.startsWith("video/")?"video":file?"image":"",
      createdAt:serverTimestamp(),likeCount:0
    });
    $("postText").value=""; $("postFile").value=""; $("postFileName").textContent="Optional, max 20 MB";
    message("postError","Post published.","success");
  } catch(e){message("postError",errorText(e),"error");}
  finally{btn.disabled=false;}
});

function renderPost(snap, admin=false) {
  const p=snap.data(), id=snap.id;
  const card=document.createElement("article"); card.className="panel post-card";
  let media="";
  if(p.mediaURL && p.mediaType==="video") media=`<video class="post-media" controls preload="metadata" src="${escapeHTML(p.mediaURL)}"></video>`;
  else if(p.mediaURL) media=`<img class="post-media" loading="lazy" src="${escapeHTML(p.mediaURL)}" alt="Post media">`;
  const canDelete=p.uid===user.uid||admin;
  card.innerHTML=`
    <div class="post-header">${avatarHTML(p.authorName,p.authorPhoto)}<div><div class="post-author">${escapeHTML(p.authorName||"Face-Chat user")}</div><div class="post-time">${escapeHTML(formatTime(p.createdAt))}</div></div>
      ${canDelete?'<button class="btn btn-light delete-post" style="margin-left:auto">Delete</button>':""}
    </div>
    ${p.text?`<div class="post-text">${escapeHTML(p.text)}</div>`:""}${media}
    <div class="post-stats"><span class="like-count">${Number(p.likeCount||0)} likes</span></div>
    <div class="post-actions"><button class="btn like-btn">👍 Like</button><button class="btn comment-toggle">💬 Comment</button></div>
    <div class="comment-box hidden"><div class="comment-list small muted">Open comments to load them.</div>
      <form class="inline-form comment-form"><input maxlength="1000" placeholder="Write a comment…" required><button class="btn btn-primary">Send</button></form>
      <p class="message error comment-error"></p>
    </div>`;
  const likeBtn=card.querySelector(".like-btn");
  likeBtn.onclick=async()=>{
    likeBtn.disabled=true;
    try {
      const postRef=doc(db,"posts",id), likeRef=doc(db,"posts",id,"likes",user.uid);
      await runTransaction(db,async tx=>{
        const [ps,ls]=await Promise.all([tx.get(postRef),tx.get(likeRef)]);
        if(!ps.exists())throw Error("Post no longer exists.");
        const count=Number(ps.data().likeCount||0);
        if(ls.exists()){tx.delete(likeRef);tx.update(postRef,{likeCount:Math.max(0,count-1)});}
        else {tx.set(likeRef,{uid:user.uid,createdAt:serverTimestamp()});tx.update(postRef,{likeCount:count+1});}
      });
    }catch(e){alert(errorText(e));}finally{likeBtn.disabled=false;}
  };
  card.querySelector(".comment-toggle").onclick=async()=>{
    const box=card.querySelector(".comment-box");box.classList.toggle("hidden");
    if(!box.classList.contains("hidden")) await loadComments(id,card);
  };
  card.querySelector(".comment-form").onsubmit=async e=>{
    e.preventDefault(); const input=e.currentTarget.querySelector("input");
    const text=input.value.trim(); if(!text)return;
    try{
      await addDoc(collection(db,"posts",id,"comments"),{uid:user.uid,authorName:displayName(),text,createdAt:serverTimestamp()});
      input.value="";await loadComments(id,card);
    }catch(err){card.querySelector(".comment-error").textContent=errorText(err);}
  };
  const del=card.querySelector(".delete-post");
  if(del)del.onclick=async()=>{
    if(!confirm("Delete this post? This will not automatically delete its uploaded media or subcollection comments."))return;
    try{await deleteDoc(doc(db,"posts",id));}catch(e){alert(errorText(e));}
  };
  return card;
}
async function loadComments(postId,card) {
  const list=card.querySelector(".comment-list");list.textContent="Loading comments…";
  try {
    const snap=await getDocs(query(collection(db,"posts",postId,"comments"),orderBy("createdAt","asc"),limit(50)));
    list.innerHTML="";
    if(snap.empty){list.textContent="No comments yet.";return;}
    snap.forEach(d=>{const c=d.data(),div=document.createElement("div");div.className="comment-item";div.innerHTML=`<strong>${escapeHTML(c.authorName||"User")}</strong><br>${escapeHTML(c.text||"")}`;list.appendChild(div);});
  }catch(e){list.textContent=errorText(e);}
}
function loadFeed() {
  if(stopFeed)stopFeed();
  stopFeed=onSnapshot(query(collection(db,"posts"),orderBy("createdAt","desc"),limit(50)),snap=>{
    const host=$("feedList");host.innerHTML="";
    if(snap.empty){host.innerHTML='<div class="panel">No posts yet. Create the first post!</div>';return;}
    snap.forEach(s=>host.appendChild(renderPost(s)));
  },e=>{$("feedList").innerHTML=`<div class="panel error">${escapeHTML(errorText(e))}</div>`;});
}

async function findUserByEmail(email) {
  const snap=await getDocs(query(collection(db,"users"),where("email","==",email),limit(1)));
  return snap.empty?null:{id:snap.docs[0].id,...snap.docs[0].data()};
}
function pairId(a,b){return [a,b].sort().join("_");}
async function areFriends(otherUid) {
  const snap=await getDoc(doc(db,"friendships",pairId(user.uid,otherUid)));
  return snap.exists() && snap.data().members?.includes(user.uid) && snap.data().members?.includes(otherUid);
}
$("friendSearchForm").onsubmit=async e=>{
  e.preventDefault();message("friendSearchMessage");
  try {
    const email=$("friendEmail").value.trim().toLowerCase();
    if(email===user.email.toLowerCase())throw Error("You cannot add yourself.");
    const target=await findUserByEmail(email);
    if(!target)throw Error("No account found for that email.");
    if(await areFriends(target.id))throw Error("You are already friends.");
    const existing=await getDocs(query(collection(db,"friendRequests"),where("fromUid","==",user.uid),where("toUid","==",target.id),limit(1)));
    if(!existing.empty)throw Error("A request has already been sent.");
    const incoming=await getDocs(query(collection(db,"friendRequests"),where("fromUid","==",target.id),where("toUid","==",user.uid),limit(1)));
    if(!incoming.empty)throw Error("This user already sent you a request. Accept it below.");
    await addDoc(collection(db,"friendRequests"),{fromUid:user.uid,fromName:displayName(),fromEmail:user.email,toUid:target.id,toName:target.displayName||"User",toEmail:target.email,status:"pending",createdAt:serverTimestamp()});
    message("friendSearchMessage","Friend request sent.","success");loadFriends();
  }catch(e){message("friendSearchMessage",errorText(e),"error");}
};
async function loadFriends() {
  const hosts=["incomingRequests","outgoingRequests","friendsList"];
  hosts.forEach(id=>$(id).textContent="Loading…");
  try{
    const [incoming,outgoing,friendDocs]=await Promise.all([
      getDocs(query(collection(db,"friendRequests"),where("toUid","==",user.uid),where("status","==","pending"),limit(100))),
      getDocs(query(collection(db,"friendRequests"),where("fromUid","==",user.uid),where("status","==","pending"),limit(100))),
      getDocs(query(collection(db,"friendships"),where("members","array-contains",user.uid),limit(200)))
    ]);
    renderRequestList("incomingRequests",incoming,true);
    renderRequestList("outgoingRequests",outgoing,false);
    friendRecords=friendDocs.docs.map(d=>({id:d.id,...d.data()}));
    const friends=await Promise.all(friendRecords.map(async f=>{
      const other=f.members.find(uid=>uid!==user.uid);
      const u=await getDoc(doc(db,"users",other));
      return {uid:other,...(u.exists()?u.data():{displayName:"User"})};
    }));
    const host=$("friendsList");host.innerHTML="";
    if(!friends.length){host.textContent="No friends yet.";return;}
    friends.forEach(f=>{
      const row=document.createElement("div");row.className="friend-row";
      row.innerHTML=`<div><strong>${escapeHTML(f.displayName||"User")}</strong><p class="small muted">${escapeHTML(f.email||"")}</p></div><button class="btn btn-primary">Message</button>`;
      row.querySelector("button").onclick=()=>openChat(f);
      host.appendChild(row);
    });
  }catch(e){hosts.forEach(id=>$(id).textContent=errorText(e));}
}
function renderRequestList(hostId,snapshot,incoming) {
  const host=$(hostId);host.innerHTML="";
  if(snapshot.empty){host.textContent="None.";return;}
  snapshot.forEach(d=>{
    const r=d.data(),row=document.createElement("div");row.className="friend-row";
    row.innerHTML=`<div><strong>${escapeHTML(incoming?r.fromName:r.toName)}</strong><p class="small muted">${escapeHTML(incoming?r.fromEmail:r.toEmail)}</p></div><div class="row-actions"></div>`;
    const actions=row.querySelector(".row-actions");
    if(incoming){
      const accept=document.createElement("button");accept.className="btn btn-primary";accept.textContent="Accept";
      accept.onclick=async()=>{try{
        await runTransaction(db,async tx=>{
          const reqRef=doc(db,"friendRequests",d.id),rs=await tx.get(reqRef);
          if(!rs.exists()||rs.data().status!=="pending")throw Error("Request is no longer pending.");
          const frRef=doc(db,"friendships",pairId(r.fromUid,r.toUid));
          tx.set(frRef,{members:[r.fromUid,r.toUid].sort(),createdAt:serverTimestamp()});
          tx.update(reqRef,{status:"accepted",acceptedAt:serverTimestamp()});
        });loadFriends();
      }catch(e){alert(errorText(e));}};
      const reject=document.createElement("button");reject.className="btn btn-light";reject.textContent="Reject";
      reject.onclick=async()=>{try{await updateDoc(doc(db,"friendRequests",d.id),{status:"rejected"});loadFriends();}catch(e){alert(errorText(e));}};
      actions.append(accept,reject);
    } else {
      const cancel=document.createElement("button");cancel.className="btn btn-light";cancel.textContent="Cancel";
      cancel.onclick=async()=>{try{await deleteDoc(doc(db,"friendRequests",d.id));loadFriends();}catch(e){alert(errorText(e));}};
      actions.append(cancel);
    }
    host.appendChild(row);
  });
}

function loadChatContacts() {
  $("chatContacts").textContent="Loading friends…";
  getDocs(query(collection(db,"friendships"),where("members","array-contains",user.uid),limit(200))).then(async snap=>{
    $("chatContacts").innerHTML="";
    if(snap.empty){$("chatContacts").textContent="Add friends first.";return;}
    for(const d of snap.docs){
      const f=d.data(),uid=f.members.find(x=>x!==user.uid),us=await getDoc(doc(db,"users",uid));
      const profile=us.exists()?us.data():{};
      const b=document.createElement("button");b.className="contact-btn";b.textContent=profile.displayName||profile.email||"Friend";
      b.onclick=()=>openChat({uid,...profile},b);$("chatContacts").appendChild(b);
    }
  }).catch(e=>$("chatContacts").textContent=errorText(e));
}
async function openChat(friend,button=null) {
  currentChat=friend;
  document.querySelectorAll(".contact-btn").forEach(b=>b.classList.toggle("active",b===button));
  const chatId=pairId(user.uid,friend.uid);
  $("chatHeading").textContent=friend.displayName||friend.email||"Chat";
  $("chatText").disabled=false;$("chatForm").querySelector("button").disabled=false;
  if(stopChatMessages)stopChatMessages();
  $("chatMessages").textContent="Loading messages…";
  stopChatMessages=onSnapshot(query(collection(db,"chats",chatId,"messages"),orderBy("createdAt","asc"),limit(100)),snap=>{
    const host=$("chatMessages");host.innerHTML="";
    snap.forEach(d=>{
      const m=d.data(),bubble=document.createElement("div");bubble.className="bubble"+(m.senderUid===user.uid?" mine":"");
      bubble.innerHTML=`${escapeHTML(m.text||"")}<span class="small">${escapeHTML(formatTime(m.createdAt))}</span>`;host.appendChild(bubble);
    });
    host.scrollTop=host.scrollHeight;
  },e=>{$("chatMessages").textContent=errorText(e);});
}
$("chatForm").onsubmit=async e=>{
  e.preventDefault();message("chatError");
  const text=$("chatText").value.trim();if(!text||!currentChat)return;
  const chatId=pairId(user.uid,currentChat.uid);
  try{
    await setDoc(doc(db,"chats",chatId),{members:[user.uid,currentChat.uid].sort(),updatedAt:serverTimestamp()},{merge:true});
    await addDoc(collection(db,"chats",chatId,"messages"),{senderUid:user.uid,text,createdAt:serverTimestamp()});
    $("chatText").value="";
  }catch(e){message("chatError",errorText(e),"error");}
};

$("storyForm").onsubmit=async e=>{
  e.preventDefault();message("storyError");
  const file=$("storyFile").files[0];if(!file){message("storyError","Choose a photo or video.","error");return;}
  const btn=e.currentTarget.querySelector("button");btn.disabled=true;
  try{
    const mediaURL=await uploadMedia(file,"stories");
    const expiresAt=Timestamp.fromDate(new Date(Date.now()+24*60*60*1000));
    await addDoc(collection(db,"stories"),{uid:user.uid,authorName:displayName(),mediaURL,mediaType:file.type.startsWith("video/")?"video":"image",createdAt:serverTimestamp(),expiresAt});
    $("storyFile").value="";message("storyError","Story uploaded.","success");loadStories();
  }catch(e){message("storyError",errorText(e),"error");}finally{btn.disabled=false;}
};
function storyCard(s) {
  const d=s.data(),card=document.createElement("div");card.className="story-card";
  const media=d.mediaType==="video"?`<video controls preload="metadata" src="${escapeHTML(d.mediaURL)}"></video>`:`<img loading="lazy" src="${escapeHTML(d.mediaURL)}" alt="Story">`;
  card.innerHTML=`${media}<strong>${escapeHTML(d.authorName||"User")}</strong><div class="small">${escapeHTML(formatTime(d.createdAt))}</div>`;
  return card;
}
async function loadStories() {
  const host=$("storiesList");host.textContent="Loading stories…";
  try{
    const snap=await getDocs(query(collection(db,"stories"),orderBy("createdAt","desc"),limit(50)));
    host.innerHTML="";const now=Date.now();
    snap.docs.filter(d=>!d.data().expiresAt?.toDate||d.data().expiresAt.toDate().getTime()>now).forEach(d=>host.appendChild(storyCard(d)));
    if(!host.children.length)host.textContent="No active stories.";
    const preview=$("storyPreview");preview.innerHTML="";
    snap.docs.filter(d=>!d.data().expiresAt?.toDate||d.data().expiresAt.toDate().getTime()>now).slice(0,8).forEach(d=>{
      const s=d.data(),chip=document.createElement("div");chip.className="story-chip";
      const media=s.mediaType==="video"?`<video src="${escapeHTML(s.mediaURL)}" muted></video>`:`<img src="${escapeHTML(s.mediaURL)}" alt="">`;
      chip.innerHTML=`<div class="story-thumb">${media}</div>${escapeHTML(s.authorName||"User")}`;preview.appendChild(chip);
    });
  }catch(e){host.textContent=errorText(e);}
}

$("profileForm").onsubmit=async e=>{
  e.preventDefault();message("profileMessage");
  const display=$("profileDisplayName").value.trim(),bio=$("profileBio").value.trim(),photoURL=$("profilePhotoURL").value.trim();
  if(!display)return message("profileMessage","Display name is required.","error");
  if(photoURL&&!/^https:\/\//i.test(photoURL))return message("profileMessage","Photo URL must begin with https://","error");
  try{
    await updateProfile(user,{displayName:display,photoURL});
    await setDoc(doc(db,"users",user.uid),{uid:user.uid,displayName:display,email:user.email,bio,photoURL,updatedAt:serverTimestamp()},{merge:true});
    $("myName").textContent=display;$("myAvatar").textContent=display.charAt(0).toUpperCase();
    message("profileMessage","Profile saved.","success");
  }catch(e){message("profileMessage",errorText(e),"error");}
};

async function loadAdmin() {
  $("adminPosts").textContent="Checking admin access…";
  try{
    const token=await user.getIdTokenResult(true);
    adminMode=token.claims.admin===true;
    setHidden("adminNavBtn",!adminMode);
    if(!adminMode){$("adminPosts").textContent="Admin access is not enabled for this account.";return;}
    const snap=await getDocs(query(collection(db,"posts"),orderBy("createdAt","desc"),limit(50)));
    $("adminPosts").innerHTML="";
    if(snap.empty){$("adminPosts").textContent="No posts.";return;}
    snap.forEach(d=>$("adminPosts").appendChild(renderPost(d,true)));
  }catch(e){$("adminPosts").textContent=errorText(e);}
}

function signedIn(u) {
  user=u;
  setHidden("authScreen",!!u);setHidden("appScreen",!u);setHidden("logoutBtn",!u);
  $("signedInLabel").textContent=u?displayName(u):"";
  if(!u){stopAll();return;}
  $("myName").textContent=displayName(u);$("myEmail").textContent=u.email||"";
  $("myAvatar").textContent=displayName(u).charAt(0).toUpperCase();
  $("profileDisplayName").value=u.displayName||"";
  $("profilePhotoURL").value=u.photoURL||"";
  loadFeed();loadStories();
  u.getIdTokenResult(true).then(t=>{adminMode=t.claims.admin===true;setHidden("adminNavBtn",!adminMode);}).catch(()=>setHidden("adminNavBtn",true));
}
onAuthStateChanged(auth,signedIn);
