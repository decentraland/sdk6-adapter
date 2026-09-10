// Appended to the SDK6 runtime bundled with the sdk6-basic fixture.
var fixtureEntities = {};
var cases = ['BoxShape','SphereShape','PlaneShape','ConeShape','CylinderShape','GLTFShape','TextShape','NFTShape','Billboard','AvatarShape','AvatarModifierArea','CameraModeArea','AttachToAvatar'];
for (var i=0; i<cases.length; i++) {
 var name=cases[i];
 try {
  var e=new Entity(name);
  e.addComponent(new Transform({position:new Vector3(i+1,1,2)}));
  var ctor=eval(name);
  var value=name==='GLTFShape'?new ctor('models/fixture.glb'):name==='TextShape'?new ctor('SDK6 probe'):name==='NFTShape'?new ctor('ethereum://0x0000000000000000000000000000000000000000/1'):name==='AvatarModifierArea'?new ctor({area:{box:new Vector3(2,2,2)},modifiers:['HIDE_AVATARS']}):name==='CameraModeArea'?new ctor({area:{box:new Vector3(2,2,2)},cameraMode:0}):new ctor();
  e.addComponent(value);engine.addEntity(e);fixtureEntities[name]=e;
  log('FIXTURE_CREATED',name,e.uuid);
 } catch(error) {log('FIXTURE_UNAVAILABLE',name,String(error));}
}
var material=new Material();material.albedoColor=Color3.Red();fixtureEntities.BoxShape.addComponent(material);
var updates=0;engine.addSystem({update:function(dt){updates++;fixtureEntities.BoxShape.getComponent(Transform).position.y=1+updates/10;}});
var canvas=new UICanvas();var label=new UIText(canvas);label.value='SDK6 UI probe';
