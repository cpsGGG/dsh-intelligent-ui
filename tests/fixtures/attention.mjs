// Regression fixture transcribed from the user's cramped, uncompiled diagram.
export const standardAttention={title:'标准 Softmax Attention',nodes:[
  {id:'q',label:'Q\nN×dₖ',tone:'blue'},
  {id:'k',label:'K\nN×dₖ',tone:'green'},
  {id:'v',label:'V\nN×dᵥ',tone:'orange'},
  {id:'scores',label:'QKᵀ / √d_k\nN×N · 2N²dₖ',tone:'blue'},
  {id:'mask',label:'因果掩码\nj > i → −∞'},
  {id:'softmax',label:'逐行 Softmax\nexp / 行和',tone:'blue'},
  {id:'weighted',label:'A·V\nN×dᵥ · 2N²dᵥ',tone:'blue'},
  {id:'out',label:'输出投影 W_O\nd×d',detail:'输出投影保持模型维度。'},
],edges:[['q','scores'],['k','scores'],['scores','mask'],['mask','softmax'],['softmax','weighted'],['v','weighted'],['weighted','out']].map(([from,to])=>({from,to})),caption:'分数矩阵、掩码与归一化依次计算。'};
export const linearAttention={title:'线性 Attention',nodes:[
  {id:'q',label:'φ(Q)\nN×d′ · O(Nd′)',tone:'blue',detail:'查询只读取聚合后的状态。'},
  {id:'k',label:'φ(K)\nN×d′ · O(Nd′)',tone:'green'},
  {id:'v',label:'V\nN×dᵥ',tone:'orange'},
  {id:'s',label:'S = φ(K)ᵀV\nd′×dᵥ · 2Nd′dᵥ',tone:'green'},
  {id:'z',label:'z = φ(K)ᵀ1\nd′ · O(Nd′)',tone:'green'},
  {id:'product',label:'φ(Q)·S\nN×dᵥ · 2Nd′dᵥ',tone:'blue'},
  {id:'norm',label:'除以 φ(Q)z + ε\nO(Nd′)',tone:'blue'},
  {id:'out',label:'输出投影 W_O\nd×d'},
],edges:[['k','s'],['v','s'],['k','z'],['q','product'],['s','product'],['product','norm'],['z','norm'],['norm','out']].map(([from,to])=>({from,to})),caption:'此图仅作布局回归，不作为因果训练算法的说明。'};
