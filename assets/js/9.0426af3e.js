(window.webpackJsonp=window.webpackJsonp||[]).push([[9],{393:function(e,t,r){},473:function(e,t,r){"use strict";var n=r(1),o=r(2),a=r(30),c=r(61),s=r(14),u=o("".slice),i=Math.max,l=Math.min;n({target:"String",proto:!0,forced:!"".substr||"b"!=="ab".substr(-1)},{substr:function(e,t){var r,n,o=s(a(this)),p=o.length,d=c(e);return d===1/0&&(d=0),d<0&&(d=i(p+d,0)),(r=void 0===t?p:c(t))<=0||r===1/0||d>=(n=l(d+r,p))?"":u(o,d,n)}})},474:function(e,t,r){var n={"./pong/pong.js":[477,1,2,35],"./pong/pong_bg.js":[363,1,2]};function o(e){if(!r.o(n,e))return Promise.resolve().then((function(){var t=new Error("Cannot find module '"+e+"'");throw t.code="MODULE_NOT_FOUND",t}));var t=n[e],o=t[0];return Promise.all(t.slice(1).map(r.e)).then((function(){return r(o)}))}o.keys=function(){return Object.keys(n)},o.id=474,e.exports=o},475:function(e,t,r){"use strict";r(393)},532:function(e,t,r){"use strict";r.r(t);var n=r(86);r(134),r(29),r(92),r(473),r(8),r(20),r(28),r(126);var o={props:{example:"",autoLoad:!1},data:function(){return{error:"",loading:!1,exampleStarted:!1}},computed:{exampleName:function(){return this.example.replace(/\w\S*/g,(function(e){return e.charAt(0).toUpperCase()+e.substr(1).toLowerCase()}))}},methods:{loadExample:function(){var e=this;return Object(n.a)(regeneratorRuntime.mark((function t(){return regeneratorRuntime.wrap((function(t){for(;;)switch(t.prev=t.next){case 0:return e.loading=!0,t.prev=1,t.next=4,r(474)("./".concat(e.example,"/").concat(e.example,".js"));case 4:(0,t.sent)().then((function(){console.log("WASM Loaded")})),t.next=11;break;case 8:t.prev=8,t.t0=t.catch(1),"Error: Using exceptions for control flow, don't mind me. This isn't actually an error!"!="".concat(t.t0)?(e.error='An error occurred loading "'.concat(e.example,'": ').concat(t.t0),console.error(t.t0),e.exampleStarted=!1):e.exampleStarted=!0;case 11:e.loading=!1;case 12:case"end":return t.stop()}}),t,null,[[1,8]])})))()}},mounted:function(){var e=this;return Object(n.a)(regeneratorRuntime.mark((function t(){return regeneratorRuntime.wrap((function(t){for(;;)switch(t.prev=t.next){case 0:return t.next=2,e.$nextTick();case 2:if(!e.autoLoad){t.next=5;break}return t.next=5,e.loadExample();case 5:case"end":return t.stop()}}),t)})))()}},a=(r(475),r(23)),c=Object(a.a)(o,(function(){var e=this,t=e.$createElement,r=e._self._c||t;return r("div",{attrs:{id:"wasm-example"}},[e.error?r("div",{staticClass:"error"},[e._v("\n    "+e._s(e.error)+"\n  ")]):e._e(),e._v(" "),e.exampleStarted||e.autoLoad?e._e():r("button",{attrs:{disabled:e.loading},on:{click:function(t){return e.loadExample()}}},[e._v("Try "+e._s(e.exampleName)+"!")])])}),[],!1,null,null,null);t.default=c.exports}}]);