# 可交互的简易dag图实现

基于d3.js v5.16.0 和 d3-dag 0.3.4实现

# 节点可选内容类型
text、html、tree、list、table、image、chart

# 如何使用
```javascript
const sampleData = /**your data**/
// 初始化和渲染图表
document.addEventListener("DOMContentLoaded", () => {
    // 创建DAG实例
    const dag = new CollapsibleDAG("#dag-container");

    // 加载数据并渲染
    dag.load(sampleData);
});
```
完整示例查看index.html

[在线demo](https://blankliu404.github.io/simple-dag/)