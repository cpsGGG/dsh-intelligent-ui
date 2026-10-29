export const attentionComparison = {
  title: '标准 Attention 与 Linear Attention',
  panels: [
    {
      title: '标准 Softmax Attention',
      nodes: [
        {id:'q',label:'Q',tone:'blue',detail:'每个位置的查询。'},
        {id:'k',label:'K',tone:'green',detail:'用于与查询匹配的键。'},
        {id:'v',label:'V',tone:'orange',detail:'被加权聚合的信息。'},
        {id:'scores',label:'QKᵀ\nN × N 相关性',tone:'blue',detail:'每个查询与所有键计算分数。'},
        {id:'weights',label:'Mask + Softmax',tone:'blue',detail:'应用需要的掩码，再将分数归一化为权重。'},
        {id:'out',label:'Attention Weights × V',tone:'blue',detail:'权重与值相乘，得到每个位置的输出。'},
      ],
      edges:[{from:'q',to:'scores'},{from:'k',to:'scores'},{from:'scores',to:'weights'},{from:'weights',to:'out'},{from:'v',to:'out'}],
      caption:'先计算 token 之间的两两关系。',
    },
    {
      title:'Linear Attention',
      nodes:[
        {id:'q',label:'Q',tone:'blue',detail:'查询映射到特征空间。'},
        {id:'k',label:'K',tone:'green',detail:'键映射到相同的特征空间。'},
        {id:'v',label:'V',tone:'orange',detail:'值将被聚合到共享状态。'},
        {id:'phiQ',label:'φ(Q)',tone:'blue',detail:'用映射后的查询读取聚合状态。'},
        {id:'phiK',label:'φ(K)',tone:'green',detail:'可分解核允许先聚合键和值。'},
        {id:'state',label:'S = φ(K)ᵀV',tone:'green',detail:'预先聚合键和值，不显式形成 N × N 权重矩阵。'},
        {id:'out',label:'φ(Q)S\n再做归一化',tone:'blue',detail:'查询读取聚合状态，并除以相应归一化项。'},
      ],
      edges:[{from:'q',to:'phiQ'},{from:'k',to:'phiK'},{from:'phiK',to:'state'},{from:'v',to:'state'},{from:'phiQ',to:'out'},{from:'state',to:'out'}],
      caption:'先聚合 K、V，再由 Q 读取。',
    },
  ],
  caption:'此图展示无因果掩码的基本形式；线性注意力使用可分解核，并非直接把 softmax 换序。',
};

export const attentionExample = {
  id:'attention',label:'架构与公式',question:'普通 Attention 和 Linear Attention 的区别是什么？',
  source:'关键差别是**先算谁和谁的关系**：标准注意力先形成 token 间的权重；线性注意力用可分解核，让 K、V 可以先聚合。\n\n'
    +'```iui-compare\n'+JSON.stringify(attentionComparison)+'\n```\n\n'
    +'标准注意力的核心公式是：\n\n$$\nY = \\operatorname{Softmax}\\!\\left(\\frac{QK^{\\mathsf{T}}}{\\sqrt{d_k}}\\right)V\n$$\n\n'
    +'线性注意力把核写成特征映射的内积，再用结合律先聚合键和值。归一化后的单个输出为：\n\n$$\no_i = \\frac{\\phi(q_i)^{\\mathsf{T}}\\left(\\sum_j\\phi(k_j)v_j^{\\mathsf{T}}\\right)}{\\phi(q_i)^{\\mathsf{T}}\\left(\\sum_j\\phi(k_j)\\right)}\n$$\n\n'
    +'这样可以避免显式存储 N × N 的注意力矩阵。实际效果与成本还取决于特征维度、核映射和是否使用因果掩码。',
};
