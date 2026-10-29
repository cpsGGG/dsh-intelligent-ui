import { attentionExample } from './attention-example.mjs';
const fence = (type, data) => '```iui-' + type + '\n' + JSON.stringify(data) + '\n```';
export const inlineSamples = [
  { id:'bill',label:'改数字，直接计算',question:'晚饭 268 元，4 个人平摊。如果人数变了呢？',source:
    '现在每人 **67 元**。下面可以直接改金额、人数，结果会跟着变。\n\n'+fence('interactive',{
      title:'这顿饭，每人付多少？',controls:[
        {id:'total',type:'number',label:'账单金额',value:268,min:0,max:100000,step:0.01,unit:'元'},
        {id:'people',type:'range',label:'一起吃饭的人',value:4,min:1,max:12,step:1,unit:'人'},
        {id:'service',type:'select',label:'服务费',value:0,options:[{label:'没有服务费',value:0},{label:'10%',value:10},{label:'15%',value:15}]}],
      outputs:[{label:'每人应付',expr:'total*(1+service/100)/people',unit:'元',precision:2},{label:'合计',expr:'total*(1+service/100)',unit:'元',precision:2}],note:'按均分计算；显示金额四舍五入至分。'})},
  { id:'diagram',label:'点图，理解关系',question:'自行车是怎么向前走、又怎么停下来的？',source:
    '踩踏的力量经过链条传到车轮；刹车负责减速。点一个部件，看它在整个过程中的作用。\n\n'+fence('diagram',{
      title:'从脚下的力，到车轮转动',nodes:[{id:'pedal',label:'脚踏与曲柄',detail:'踩踏让曲柄旋转，带动牙盘。'},{id:'chain',label:'链条',detail:'链条传递牙盘的转动，带动后轮的飞轮。'},{id:'wheel',label:'后轮',detail:'后轮与地面的摩擦力推动自行车向前。'},{id:'brake',label:'刹车',detail:'刹车产生阻力，让车轮减速。'}],edges:[{from:'pedal',to:'chain',label:'传递力'},{from:'chain',to:'wheel',label:'驱动'},{from:'brake',to:'wheel',label:'减速'}]})},
  { id:'chart',label:'看数据，切换角度',question:'这周每天读了 25、40、55、20、45 分钟，帮我看看。',source:
    '这周共读了 **185 分钟**，平均每天 **37 分钟**。周三最多，周四最少。\n\n'+fence('chart',{
      title:'每天的阅读时间',unit:'分钟',source:'示例问题给定数据',values:[{label:'周一',value:25},{label:'周二',value:40},{label:'周三',value:55},{label:'周四',value:20},{label:'周五',value:45}]})+'\n\n'+fence('tabs',{
      title:'接下来怎么看',panels:[{label:'总量',body:'一周累计 **185 分钟**，相当于 3 小时 5 分钟。'},{label:'波动',body:'最多与最少相差 **35 分钟**。单周数据不足以判断长期习惯。'},{label:'下一步',body:'可以先试试每天固定 25 分钟，周末再看这一周是否更稳定。'}]})},
  { id:'plan',label:'按步骤，逐项完成',question:'我想做一个小产品，先做哪几件事？',source:
    '先验证一个具体需求，再做能试用的小版本。\n\n'+fence('flow',{
      title:'从想法到第一次试用',steps:[{title:'找到场景',detail:'一个人，在什么时刻，遇到什么问题'},{title:'做最小版本',detail:'完成一件关键事情'},{title:'找人试用',detail:'观察他能不能独立完成'}]})+'\n\n'+fence('checklist',{
      title:'第一次试用前',items:['写下一句清楚的使用场景','准备一个可操作的核心功能','找一位真实用户试用','记录他卡住的地方']})},
  attentionExample,
];
