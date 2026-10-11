(function(){
  "use strict";
  var state={peer:null,connections:[],name:"Builder",color:"#55d6ff",scene:null,camera:null,markers:{},isApplyingRemote:false,lastPresence:0};
  var api=window.BlockbotzCollab={
    isApplyingRemote:false,
    init:function(ctx){ state.scene=ctx.scene; state.camera=ctx.camera; setupUI(); autoJoin(); },
    broadcastLevel:function(level){ if(state.isApplyingRemote) return; sendAll({type:"level",level:level}); },
    updateLocalPresence:function(camera){
      if(!state.connections.length) return;
      var now=performance.now(); if(now-state.lastPresence<80) return; state.lastPresence=now;
      var f=new THREE.Vector3(); camera.getWorldDirection(f);
      sendAll({type:"presence",name:state.name,color:state.color,pos:{x:camera.position.x,y:camera.position.y,z:camera.position.z},dir:{x:f.x,y:f.y,z:f.z}});
    }
  };
  function setupUI(){
    var create=document.getElementById("collab-create"), copy=document.getElementById("collab-copy"), name=document.getElementById("collab-name"), link=document.getElementById("collab-link");
    if(!create) return;
    create.onclick=function(){ var cc=document.getElementById("collab-color"); if(cc) state.color=safeColor(cc.value); state.name=(name.value||"Builder").trim().slice(0,24)||"Builder"; createRoom(); };
    copy.onclick=function(){ if(link.value) navigator.clipboard&&navigator.clipboard.writeText(link.value); };
    var close=document.getElementById("collab-modal-close");
    if(close) close.addEventListener("click",function(){
      var modal=document.getElementById("collab-modal");
      if(modal) modal.classList.remove("open");
    });
    var modal=document.getElementById("collab-modal");
    if(modal) modal.addEventListener("click",function(e){
      if(e.target===modal) modal.classList.remove("open");
    });
  }
  function status(t){ var el=document.getElementById("collab-status"); if(el) el.innerHTML=t; }
  function createRoom(){
    if(!window.Peer){ status("<strong>Collaboration library failed to load.</strong>"); return; }
    if(state.peer) state.peer.destroy();
    state.peer=new Peer();
    state.peer.on("open",function(id){
      var url=new URL(location.href); url.searchParams.set("room",id);
      document.getElementById("collab-link").value=url.href; document.getElementById("collab-copy").disabled=false;
      status("<strong>Room ready.</strong><br><br>Send the link to your friend. When they join, their builder marker will appear in your scene.");
    });
    state.peer.on("connection",setupConnection);
    state.peer.on("error",function(e){ status("<strong>Room error:</strong> "+(e.type||"connection error")); });
  }
  function safeColor(c){ return /^#[0-9a-f]{6}$/i.test(c||"")?c:"#55d6ff"; }
  function autoJoin(){
    var room=new URLSearchParams(location.search).get("room"); if(!room || !window.Peer) return;
    showJoinDialog(function(name,color){
      state.name=name; state.color=color;
      state.peer=new Peer();
      state.peer.on("open",function(){ setupConnection(state.peer.connect(room)); });
    });
  }
  function showJoinDialog(onJoin){
    var ov=document.createElement("div"); ov.className="modal-overlay open";
    ov.innerHTML='<div class="modal"><div class="modal-head"><span>Join Room</span></div><div class="modal-body">'+
      '<div class="collab-status"><strong>Pick your builder name and color.</strong></div>'+
      '<div class="save-form" style="margin-top:12px"><input id="join-name" maxlength="24" placeholder="Your builder name" value="Builder">'+
      '<input type="color" id="join-color" value="#55d6ff" title="Your color" style="width:42px;height:34px;padding:2px;flex:none;cursor:pointer">'+
      '<button class="btn primary" id="join-go">Join</button></div></div></div>';
    document.body.appendChild(ov);
    var nameEl=ov.querySelector("#join-name"), colorEl=ov.querySelector("#join-color");
    function go(){
      var name=(nameEl.value||"Builder").trim().slice(0,24)||"Builder";
      var color=safeColor(colorEl.value);
      document.body.removeChild(ov); onJoin(name,color);
    }
    ov.querySelector("#join-go").onclick=go;
    nameEl.addEventListener("keydown",function(e){ e.stopPropagation(); if(e.key==="Enter") go(); });
    nameEl.focus(); nameEl.select();
  }
  function setupConnection(conn){
    state.connections.push(conn);
    conn.on("open",function(){
      conn.send({type:"hello",name:state.name,color:state.color,level:window.BlockbotzGetLevel?window.BlockbotzGetLevel():{objects:[]}});
      status("<strong>Connected.</strong><br><br>Collaboration is active. Your friend's ball and facing arrow will appear in the 3D view.");
    });
    conn.on("data",function(msg){
      if(!msg||!msg.type) return;
      if(msg.type==="hello"){ if(msg.level && window.BlockbotzSetLevel){ state.isApplyingRemote=true; api.isApplyingRemote=true; window.BlockbotzSetLevel(msg.level); state.isApplyingRemote=false; api.isApplyingRemote=false; } }
      else if(msg.type==="level" && msg.level && window.BlockbotzSetLevel){ state.isApplyingRemote=true; api.isApplyingRemote=true; window.BlockbotzSetLevel(msg.level); state.isApplyingRemote=false; api.isApplyingRemote=false; }
      else if(msg.type==="presence") updateMarker(conn.peer,msg);
    });
    conn.on("close",function(){ removeMarker(conn.peer); state.connections=state.connections.filter(function(c){return c!==conn;}); });
  }
  function sendAll(msg){ state.connections.slice().forEach(function(c){ if(c.open) try{c.send(msg);}catch(e){} }); }
  function makeLabel(text){
    var c=document.createElement("canvas"); c.width=512; c.height=128;
    var g=c.getContext("2d");
    g.font="bold 56px system-ui, Arial, sans-serif"; g.textAlign="center"; g.textBaseline="middle";
    var w=Math.min(g.measureText(text).width+48,500);
    g.fillStyle="rgba(13,17,23,0.78)"; g.fillRect(256-w/2,22,w,84);
    g.fillStyle="#ffffff"; g.fillText(text,256,66,w-32);
    var tex=new THREE.CanvasTexture(c);
    var sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));
    sp.scale.set(2.4,.6,1); sp.position.set(0,1.15,0); sp.renderOrder=999;
    return sp;
  }
  function setLabel(m,text){
    text=String(text||"Builder").slice(0,24);
    if(m.name===text) return; m.name=text;
    if(m.label){ m.group.remove(m.label); if(m.label.material.map) m.label.material.map.dispose(); m.label.material.dispose(); }
    m.label=makeLabel(text); m.group.add(m.label);
  }
  function applyColor(m,hex){ if(m.color===hex) return; m.color=hex; m.ball.material.color.set(hex); m.arrow.setColor(hex); }
  function updateMarker(id,msg){
    if(!state.scene) return; var m=state.markers[id];
    if(!m){
      var group=new THREE.Group();
      var ball=new THREE.Mesh(new THREE.SphereGeometry(.35,16,12),new THREE.MeshBasicMaterial({color:0x55d6ff}));
      var arrow=new THREE.ArrowHelper(new THREE.Vector3(0,0,-1),new THREE.Vector3(0,0,0),1.1,0x55d6ff,.22,.12);
      group.add(ball); group.add(arrow); state.scene.add(group); m={group:group,arrow:arrow,ball:ball,label:null,name:null,color:null}; state.markers[id]=m;
    }
    setLabel(m,msg.name);
    applyColor(m,safeColor(msg.color));
    m.group.position.set(msg.pos.x,msg.pos.y,msg.pos.z);
    m.arrow.setDirection(new THREE.Vector3(msg.dir.x,msg.dir.y,msg.dir.z).normalize());
  }
  function removeMarker(id){ var m=state.markers[id]; if(!m) return; state.scene.remove(m.group); if(m.label){ if(m.label.material.map) m.label.material.map.dispose(); m.label.material.dispose(); } delete state.markers[id]; }
})();
