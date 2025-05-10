// 可交互有向无环图类
class CollapsibleDAG {
  constructor(container, options = {}) {
    this.container = d3.select(container);
    this.options = Object.assign(
      {
        nodeWidth: 180,
        nodeHeight: 100,
        nodePadding: 10,
        levelSeparation: 120,
        nodeSeparation: 50,
        transitionDuration: 500,
      },
      options
    );

    // 日志D3版本以便调试
    console.log("当前D3版本:", d3.version);

    // 创建主SVG元素
    this.svg = this.container
      .append("svg")
      .attr("width", "100%")
      .attr("height", "100%");

    // 创建主图层
    this.graph = this.svg.append("g");

    // 创建边和节点的图层
    this.linksGroup = this.graph.append("g").attr("class", "links");
    this.nodesGroup = this.graph.append("g").attr("class", "nodes");

    // 存储图表实例的引用，用于事件处理器中引用
    const self = this;

    // 添加布局方向属性
    this.direction = "LR"; 

    // 拖拽相关状态
    this.dragEnabled = false;
    this.draggedNodes = new Map(); // 存储已拖拽节点的位置

    // 启用缩放和平移 - 使用D3 v5兼容的方式
    this.zoom = d3
      .zoom()
      .scaleExtent([0.1, 3])
      .on("zoom", function () {
        // 在D3 v5中使用d3.event，而不是事件参数
        self.graph.attr("transform", d3.event.transform);
      });

    this.svg.call(this.zoom);

    // 设置工具提示
    this.tooltip = d3.select("#tooltip");

    // 存储节点展开/折叠状态和原始数据
    this.nodeStates = new Map();
    this.highlightedLinks = new Set();

    // 初始添加箭头标记
    this.addArrowheadMarker();

    // 绑定控制按钮事件
    this.bindControls();
  }

  // 绑定控制按钮事件
  bindControls() {
    const self = this;

    d3.select("#zoom-in").on("click", function () {
      self.svg.transition().duration(300).call(self.zoom.scaleBy, 1.2);
    });

    d3.select("#zoom-out").on("click", function () {
      self.svg.transition().duration(300).call(self.zoom.scaleBy, 0.8);
    });

    d3.select("#reset-zoom").on("click", function () {
      self.centerGraph();
    });

    d3.select("#expand-all").on("click", function () {
      self.expandAll();
    });

    d3.select("#collapse-all").on("click", function () {
      self.collapseAll();
    });

    // 方向切换下拉菜单事件
    d3.select("#direction-select").on("change", function () {
      self.direction = this.value;

      // 方向切换时清除拖拽位置
      if (self.draggedNodes.size > 0) {
        if (confirm("切换方向将重置所有手动拖拽的节点位置，是否继续？")) {
          self.draggedNodes.clear();
        } else {
          // 恢复选择器值
          d3.select(this).property("value", self.direction);
          return;
        }
      }

      self.render();
    });

    // 拖拽模式切换按钮事件
    d3.select("#toggle-drag").on("click", function () {
      self.dragEnabled = !self.dragEnabled;
      d3.select(this).text(self.dragEnabled ? "退出拖拽" : "启用拖拽");

      // 切换图表区域的CSS类以显示当前模式
      d3.select("#dag-container").classed("drag-mode", self.dragEnabled);

      // 如果退出拖拽模式，清除所有临时拖拽状态
      if (!self.dragEnabled) {
        self.nodesGroup.selectAll("g.node").classed("dragging", false);
      }
    });
  }

  // 展开所有节点
  expandAll() {
    this.nodeStates.forEach((state, id) => {
      if (state.hasChildren) {
        state.collapsed = false;
      }
    });
    this.render();
  }

  // 折叠所有非根节点
  collapseAll() {
    this.nodeStates.forEach((state, id) => {
      if (state.hasChildren && !state.isRoot) {
        state.collapsed = true;
      }
    });
    this.render();
  }

  // 加载数据并渲染图表
  load(data) {
    if (!data || !data.nodes || !data.links || data.nodes.length === 0) {
      console.error("提供的数据为空或格式不正确");
      this.showErrorMessage("提供的数据为空或格式不正确。请检查数据源。");
      return this;
    }

    console.log(
      `加载数据: ${data.nodes.length} 个节点, ${data.links.length} 个连接`
    );

    this.rawData = data;
    this.processData();
    this.render();
    return this;
  }

  // 处理数据，准备渲染
  processData() {
    try {
      console.log("开始处理DAG数据...");

      // 检查节点ID是否唯一
      const nodeIds = new Set();
      const duplicates = [];

      // 检测重复ID
      this.rawData.nodes.forEach((node) => {
        if (nodeIds.has(node.id)) {
          duplicates.push(node.id);
        } else {
          nodeIds.add(node.id);
        }
      });

      // 处理重复ID
      if (duplicates.length > 0) {
        console.warn(`发现重复的节点ID: ${duplicates.join(", ")}`);

        // 创建ID映射以跟踪更改
        const idMap = new Map();

        // 重新遍历并修复重复ID
        nodeIds.clear();
        this.rawData.nodes.forEach((node) => {
          if (nodeIds.has(node.id)) {
            // 创建唯一ID
            let uniqueId = `${node.id}_${Math.random()
              .toString(36)
              .substr(2, 5)}`;
            while (nodeIds.has(uniqueId)) {
              uniqueId = `${node.id}_${Math.random()
                .toString(36)
                .substr(2, 5)}`;
            }

            // 记录ID映射用于更新links
            idMap.set(node.id, uniqueId);

            // 更新节点ID
            console.log(`将重复ID "${node.id}" 更改为 "${uniqueId}"`);
            node.id = uniqueId;
          }
          nodeIds.add(node.id);
        });

        // 更新links中的引用
        this.rawData.links.forEach((link) => {
          if (idMap.has(link.source)) {
            link.source = idMap.get(link.source);
          }
          if (idMap.has(link.target)) {
            link.target = idMap.get(link.target);
          }
        });
      }

      // 将数据转换为正确的格式
      const processedData = this.rawData.nodes.map((node) => {
        // 查找以该节点为目标的所有连接
        const parentLinks = this.rawData.links.filter(
          (link) => link.target === node.id
        );

        // 提取父节点 ID
        const parentIds = parentLinks.map((link) => link.source);

        // 返回带有 parentIds 属性的节点
        return {
          id: node.id,
          parentIds: parentIds.length > 0 ? parentIds : undefined,
          ...node,
        };
      });

      // 创建DAG数据结构
      console.log("使用d3.dagStratify创建DAG...");
      this.dag = d3.dagStratify()(processedData);

      // 输出根节点数量进行验证
      const rootNodes = this.dag.roots();
      console.log(`DAG创建完成，找到 ${rootNodes.length} 个根节点`);

      // 初始化节点状态
      this.dag.descendants().forEach((node) => {
        const hasChildren = node.children && node.children.length > 0;
        const isRoot = rootNodes.includes(node);

        this.nodeStates.set(node.id, {
          collapsed: false, // 初始展开所有节点
          hasChildren,
          isRoot,
          data: node.data,
        });
      });

      console.log("节点状态初始化完成");
    } catch (error) {
      console.error("处理DAG数据时出错:", error);
      this.showErrorMessage(`处理数据时出错: ${error.message}`);
    }
  }

  // 渲染图表
  render() {
    // 获取可见的DAG
    const visibleDag = this.getVisibleDag();

    // 如果没有可见的DAG，方法内已显示错误信息
    if (!visibleDag) {
      return;
    }

    try {
      // 设置布局 - 修改这部分以兼容d3-dag 0.3.4
      const layout = d3
        .sugiyama()
        .nodeSize([
          this.options.nodeWidth + this.options.nodeSeparation,
          this.options.nodeHeight + this.options.levelSeparation,
        ]);

      // 应用布局
      layout(visibleDag);

      // 根据方向参数手动调整坐标
      this.applyDirectionTransform(visibleDag);

      // 确保每个节点都有x和y坐标
      visibleDag.descendants().forEach((node) => {
        // 如果节点已被拖拽，保留拖拽位置
        if (this.draggedNodes.has(node.id)) {
          const pos = this.draggedNodes.get(node.id);
          node.fx = pos.x;
          node.fy = pos.y;
          node.x = pos.x;
          node.y = pos.y;
        } else {
          // 如果节点缺少坐标，设置默认值
          if (typeof node.x !== "number") node.x = 0;
          if (typeof node.y !== "number") node.y = 0;
          node.fx = null;
          node.fy = null;
        }
      });

      // 渲染边
      this.renderLinks(visibleDag);

      // 渲染节点
      this.renderNodes(visibleDag);

      // 居中显示图表
      if (!this.initialRender) {
        this.centerGraph();
        this.initialRender = true;
      }
    } catch (error) {
      console.error("渲染DAG时出错:", error);
      this.showErrorMessage(`渲染图表时出错: ${error.message}`);
    }
  }

  // 添加新方法：根据方向变换坐标
  applyDirectionTransform(dag) {
    const nodes = dag.descendants();
    const bounds = this.calculateBounds(nodes);

    switch (this.direction) {
      case "TB": // 从上到下 (默认)
        // 无需调整
        break;

      case "BT": // 从下到上
        // 翻转 Y 坐标
        nodes.forEach((node) => {
          node.y = -node.y;
        });
        break;

      case "LR": // 从左到右
        // 交换 X 和 Y 坐标
        nodes.forEach((node) => {
          const temp = node.x;
          node.x = node.y;
          node.y = temp;
        });
        break;

      case "RL": // 从右到左
        // 交换 X 和 Y 坐标并翻转 X
        nodes.forEach((node) => {
          const temp = node.x;
          node.x = -node.y;
          node.y = temp;
        });
        break;
    }

    // 调整链接点以匹配新的节点位置
    dag.links().forEach((link) => {
      if (link.points) {
        link.points.forEach((point) => {
          switch (this.direction) {
            case "TB": // 默认
              break;
            case "BT":
              point.y = -point.y;
              break;
            case "LR":
              const tempLR = point.x;
              point.x = point.y;
              point.y = tempLR;
              break;
            case "RL":
              const tempRL = point.x;
              point.x = -point.y;
              point.y = tempRL;
              break;
          }
        });
      }
    });
  }

  // 计算节点边界的辅助方法
  calculateBounds(nodes) {
    let minX = Infinity,
      minY = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity;

    nodes.forEach((node) => {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x);
      maxY = Math.max(maxY, node.y);
    });

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  getPoints(link) {
    let sourceX = link.source.x
    let sourceY = link.source.y
    let targetX = link.target.x
    let targetY = link.target.y
    switch (this.direction) {
      case 'TB':
        sourceY += this.options.nodeHeight / 2
        targetY -= this.options.nodeHeight / 2
        break
      case 'BT':
        sourceY -= this.options.nodeHeight / 2
        targetY += this.options.nodeHeight / 2
        break
      case 'LR':
        sourceX += this.options.nodeWidth / 2
        targetX -= this.options.nodeWidth / 2
        break
      case 'RL':
        sourceX -= this.options.nodeWidth / 2
        targetX += this.options.nodeWidth / 2
        break
    }

    return [
      { x: sourceX, y: sourceY },
      { x: targetX, y: targetY },
    ]
  }

  // 渲染边
  renderLinks(dag) {
    try {
      // 获取所有边
      const linkData = dag.links();

      // 确保每个连接都有points属性，如果没有则创建
      linkData.forEach((link) => {
        if (
          !link.points ||
          !Array.isArray(link.points) ||
          link.points.length < 2
        ) {
          // 如果源或目标节点未定义坐标，使用默认坐标
          // 创建默认的直线连接点
          link.points = this.getPoints(link);
        }
      });

      // 创建简单的曲线连接
      const lineGenerator = d3
        .line()
        .x((d) => d.x)
        .y((d) => d.y)
        .curve(d3.curveBasis);

      // 更新现有边
      const links = this.linksGroup
        .selectAll("path.link")
        .data(linkData, (d) => `${d.source.id}-${d.target.id}`);

      // 删除不再需要的边
      links.exit().remove();

      // 添加新的边
      const enterLinks = links
        .enter()
        .append("path")
        .attr("class", "link")
        .attr("id", (d) => `link-${d.source.id}-${d.target.id}`)
        .attr("marker-end", "url(#arrowhead)");

      // 更新所有边
      enterLinks
        .merge(links)
        .classed("link-highlight", (d) =>
          this.highlightedLinks.has(`${d.source.id}-${d.target.id}`)
        )
        .transition()
        .duration(this.options.transitionDuration * 2)
        .attr("d", (d) => {
          try {
            // 尝试使用d3曲线生成器
            return lineGenerator(d.points);
          } catch (e) {
            console.warn("绘制连接线时出错:", e);
            // 返回一个简单的直线作为后备
            return `M${d.source.x},${d.source.y} L${d.target.x},${d.target.y}`;
          }
        });
    } catch (error) {
      console.error("渲染连接时出错:", error);
    }
  }

  // 创建节点拖拽行为
  createDragBehavior() {
    const self = this;

    return d3
      .drag()
      .on("start", function (d) {
        // 拖拽开始时，如果不是在拖拽模式，则不做任何操作
        if (!self.dragEnabled) return;

        // 阻止事件冒泡和默认行为
        if (d3.event.sourceEvent) {
          d3.event.sourceEvent.stopPropagation();
          d3.event.sourceEvent.preventDefault();
        }

        // 记录起始位置
        d.fx = d.x;
        d.fy = d.y;

        // 将当前节点移到顶部，以便清晰显示
        d3.select(this).raise();

        // 标记节点正在拖动
        d3.select(this).classed("dragging", true);
      })
      .on("drag", function (d) {
        // 拖拽过程中，如果不是在拖拽模式，则不做任何操作
        if (!self.dragEnabled) return;

        // 更新节点位置
        d.fx = d3.event.x;
        d.fy = d3.event.y;

        // 更新节点在屏幕上的位置
        d3.select(this).attr(
          "transform",
          `translate(${d.fx - self.options.nodeWidth / 2}, ${
            d.fy - self.options.nodeHeight / 2
          })`
        );

        // 更新与该节点相关的连接线
        self.updateConnectedLinks(d);
      })
      .on("end", function (d) {
        // 拖拽结束时，如果不是在拖拽模式，则不做任何操作
        if (!self.dragEnabled) return;

        // 保存拖拽后的位置
        self.draggedNodes.set(d.id, { x: d.fx, y: d.fy });

        // 标记节点不再拖动
        d3.select(this).classed("dragging", false);
      });
  }

  // 更新与节点相关的连接线
  updateConnectedLinks(node) {
    // 更新所有与该节点相关的边
    this.linksGroup
      .selectAll("path.link")
      .filter((d) => d.source.id === node.id || d.target.id === node.id)
      .each(function (d) {
        // 获取源和目标的当前位置（考虑拖拽位置）
        const sx = d.source.fx || d.source.x;
        const sy = d.source.fy || d.source.y;
        const tx = d.target.fx || d.target.x;
        const ty = d.target.fy || d.target.y;

        // 计算新的连接点
        const points = [
          { x: sx, y: sy },
          { x: (sx + tx) / 2, y: (sy + ty) / 2 },
          { x: tx, y: ty },
        ];

        // 根据方向调整中间点
        const dx = tx - sx;
        const dy = ty - sy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // 使曲线更自然
        if (dist > 0) {
          if (Math.abs(dx) > Math.abs(dy)) {
            // 横向放置的节点
            points[1].y += dist * 0.2;
          } else {
            // 纵向放置的节点
            points[1].x += dist * 0.2;
          }
        }

        // 使用曲线连接
        const lineGenerator = d3
          .line()
          .x((p) => p.x)
          .y((p) => p.y)
          .curve(d3.curveBasis);

        // 更新路径
        d3.select(this).attr("d", lineGenerator(points));
      });
  }

  // 渲染节点
  renderNodes(dag) {
    try {
      // 获取所有节点
      const nodeData = dag.descendants();
      if (!nodeData || nodeData.length === 0) {
        console.warn("没有可用的节点数据");
        return;
      }

      // 保存this引用供事件处理器使用
      const self = this;

      // 创建拖拽行为
      const dragBehavior = this.createDragBehavior();

      // 应用已保存的拖拽位置
      nodeData.forEach((node) => {
        if (this.draggedNodes.has(node.id)) {
          const pos = this.draggedNodes.get(node.id);
          node.fx = pos.x;
          node.fy = pos.y;
          node.x = pos.x;
          node.y = pos.y;
        }
      });

      // 更新现有节点
      const nodes = this.nodesGroup
        .selectAll("g.node")
        .data(nodeData, (d) => d.id);

      // 删除不再需要的节点
      nodes.exit().remove();

      // 添加新的节点
      const enterNodes = nodes
        .enter()
        .append("g")
        .attr("class", "node")
        .attr("id", (d) => `node-${d.id}`)
        .attr("transform", (d) => {
          const x = d.fx || d.x || 0;
          const y = d.fy || d.y || 0;
          return `translate(${x - this.options.nodeWidth / 2}, ${
            y - this.options.nodeHeight / 2
          })`;
        })
        .on("click", function (d) {
          // 只有当不在拖拽模式时，才处理点击
          if (!self.dragEnabled) {
            d3.event.stopPropagation();
            self.handleNodeClick(d);
          }
        })
        .on("mouseover", function (d) {
          self.handleNodeMouseOver(d);
        })
        .on("mouseout", function (d) {
          self.handleNodeMouseOut(d);
        })
        .call(dragBehavior); // 应用拖拽行为

      // 添加节点矩形
      enterNodes
        .append("rect")
        .attr("width", this.options.nodeWidth)
        .attr("height", this.options.nodeHeight);

      // 添加外部HTML内容容器
      enterNodes
        .append("foreignObject")
        .attr("width", this.options.nodeWidth)
        .attr("height", this.options.nodeHeight)
        .append("xhtml:div")
        .style("height", "100%")
        .style("display", "flex")
        .style("flex-direction", "column")
        .html((d) => {
          const state = this.nodeStates.get(d.id);
          const hasChildren = state && state.hasChildren;
          const isCollapsed = state && state.collapsed;

          // 创建标题和内容
          return `
                        <div class="node-title">${d.data.name || d.id}
                            ${
                              hasChildren
                                ? `<span style="float:right">${
                                    isCollapsed ? "▶" : "▼"
                                  }</span>`
                                : ""
                            }
                        </div>
                        <div class="node-content">
                            ${this.renderNodeContent(d)}
                        </div>
                    `;
        });

      // 更新所有节点
      enterNodes
        .merge(nodes)
        .classed("collapsed", (d) => {
          const state = this.nodeStates.get(d.id);
          return state && state.collapsed;
        })
        .transition()
        .duration(this.options.transitionDuration)
        .attr("transform", (d) => {
          // 使用拖拽位置（如果有）或布局计算的位置
          const x = d.fx || d.x || 0;
          const y = d.fy || d.y || 0;
          return `translate(${x - this.options.nodeWidth / 2}, ${
            y - this.options.nodeHeight / 2
          })`;
        });
    } catch (error) {
      console.error("渲染节点时出错:", error);
    }
  }

  // 处理节点点击事件
  handleNodeClick(node) {
    const state = this.nodeStates.get(node.id);
    if (!state || !state.hasChildren) return;

    // 切换折叠状态
    state.collapsed = !state.collapsed;

    // 重新渲染
    this.render();
  }

  // 处理节点鼠标悬停事件
  handleNodeMouseOver(node) {
    // 显示工具提示
    const nodeData = node.data;
    if (nodeData.tooltip) {
      this.tooltip
        .style("left", `${d3.event.pageX + 10}px`)
        .style("top", `${d3.event.pageY + 10}px`)
        .html(nodeData.tooltip)
        .style("opacity", 1);
    }

    // 高亮相关边
    this.highlightConnections(node);
  }

  // 处理节点鼠标离开事件
  handleNodeMouseOut(node) {
    // 隐藏工具提示
    this.tooltip.style("opacity", 0);

    // 取消高亮
    this.highlightedLinks.clear();
    this.linksGroup.selectAll("path.link").classed("link-highlight", false);
  }

  // 高亮与节点相连的边
  highlightConnections(node) {
    this.highlightedLinks.clear();

    // 高亮输入边
    if (node.parents) {
      node.parents.forEach((parent) => {
        this.highlightedLinks.add(`${parent.id}-${node.id}`);
      });
    }

    // 高亮输出边
    if (node.children) {
      node.children.forEach((child) => {
        this.highlightedLinks.add(`${node.id}-${child.id}`);
      });
    }

    // 应用高亮样式
    this.linksGroup
      .selectAll("path.link")
      .classed("link-highlight", (d) =>
        this.highlightedLinks.has(`${d.source.id}-${d.target.id}`)
      );
  }

  // 根据节点的展开/折叠状态获取可见的DAG
  getVisibleDag() {
    // 检查DAG是否已初始化
    if (!this.dag) {
      console.warn("DAG未初始化，无法获取可见节点");
      this.showErrorMessage("数据未正确加载，请检查控制台以获取详细信息");
      return null;
    }

    try {
      // 创建新的DAG数据
      const visibleNodes = [];
      const visibleLinks = [];
      const processedNodeIds = new Set(); // 避免节点重复

      // 递归处理节点
      const processNode = (node, isVisible = true) => {
        if (!isVisible) return;

        // 避免重复处理节点
        if (processedNodeIds.has(node.id)) return;
        processedNodeIds.add(node.id);

        // 添加当前节点
        visibleNodes.push({
          id: node.id,
          parentIds: [], // 将在后面填充
          ...node.data,
        });

        // 检查子节点
        const state = this.nodeStates.get(node.id);
        const isCollapsed = state && state.collapsed;

        if (node.children && !isCollapsed) {
          // 添加子节点和连接
          node.children.forEach((child) => {
            visibleLinks.push({
              source: node.id,
              target: child.id,
            });
            processNode(child, true);
          });
        }
      };

      // 从根节点开始处理
      const roots = this.dag.roots();
      console.log(`找到 ${roots.length} 个根节点`);
      roots.forEach((root) => processNode(root));

      // 为每个节点设置parentIds
      visibleNodes.forEach((node) => {
        const incomingLinks = visibleLinks.filter(
          (link) => link.target === node.id
        );
        node.parentIds = incomingLinks.map((link) => link.source);
      });

      // 检查是否有可见节点
      if (visibleNodes.length === 0) {
        console.warn(
          "没有可见节点。这可能是因为所有节点都被折叠了，或者原始数据为空。"
        );
        this.showErrorMessage("无可显示的数据。请展开节点或检查数据源。");
        return null;
      }

      console.log(
        `处理得到 ${visibleNodes.length} 个可见节点和 ${visibleLinks.length} 个连接`
      );

      // 确保数据为d3.dagStratify()准备好
      try {
        // 将节点转换为d3.dagStratify所需的格式
        const stratifyData = visibleNodes.map((node) => ({
          id: node.id,
          parentIds: node.parentIds.length > 0 ? node.parentIds : undefined,
          ...node,
        }));

        // 输出第一个节点用于调试
        if (stratifyData.length > 0) {
          console.log("第一个节点示例:", stratifyData[0]);
        }

        return d3.dagStratify()(stratifyData);
      } catch (error) {
        console.error("使用d3.dagStratify创建DAG时出错:", error);
        this.showErrorMessage(`创建DAG时出错: ${error.message}`);
        return null;
      }
    } catch (error) {
      console.error("在getVisibleDag中处理数据时出错:", error);
      this.showErrorMessage(`处理数据时出错: ${error.message}`);
      return null;
    }
  }

  // 渲染节点内容
  renderNodeContent(node) {
    if (!node.data.content) return "";

    switch (node.data.contentType) {
      case "text":
        return `<div class="c-scroll">${node.data.content}</div>`;

      case "html":
        return node.data.content;

      case "tree":
        return `<div class="c-scroll"><div class="mini-tree">${this.renderTreeContent(
          node.data.content
        )}</div></div>`;

      case "list":
        if (!Array.isArray(node.data.content)) return "";
        return `<div class="c-scroll">
                    <ul style="margin:0; padding-left:15px;">
                        ${node.data.content
                          .map((item) => `<li>${item}</li>`)
                          .join("")}
                    </ul>
                </div>`;

      case "table":
        if (!node.data.content.headers || !node.data.content.rows) return "";
        return `<div class="c-scroll">
                    <table style="border-collapse:collapse; width:100%; font-size:10px;">
                        <thead>
                            <tr>
                                ${node.data.content.headers
                                  .map(
                                    (h) =>
                                      `<th style="text-align:left; border:1px solid #ddd; padding:2px;">${h}</th>`
                                  )
                                  .join("")}
                            </tr>
                        </thead>
                        <tbody>
                            ${node.data.content.rows
                              .map(
                                (row) =>
                                  `<tr>
                                    ${row
                                      .map(
                                        (cell) =>
                                          `<td style="border:1px solid #ddd; padding:2px;">${cell}</td>`
                                      )
                                      .join("")}
                                </tr>`
                              )
                              .join("")}
                        </tbody>
                    </table>
                  </div>
                `;

      case "image":
        return `<div class="c-scroll"><img src="${node.data.content}" style="max-width:100%; max-height:60px; display:block; margin:0 auto;" /></div>`;

      case "chart":
        // 为图表创建容器，稍后可以使用库渲染图表
        return `<div class="c-scroll"><div class="chart-container" data-chart-id="${node.id}" style="width:100%; height:60px;"></div></div>`;

      default:
        return `<div class="c-scroll">${node.data.content}</div>`;
    }
  }

  // 渲染树内容
  renderTreeContent(treeData) {
    if (!treeData || !treeData.length) return "";

    let html = "<ul>";
    treeData.forEach((item) => {
      html += `<li>${item.name}`;
      if (item.children && item.children.length) {
        html += this.renderTreeContent(item.children);
      }
      html += "</li>";
    });
    html += "</ul>";
    return html;
  }

  // 居中显示图表
  centerGraph() {
    try {
      const svgBounds = this.svg.node().getBoundingClientRect();
      const graphBounds = this.graph.node().getBBox();

      const width = svgBounds.width;
      const height = svgBounds.height;

      // 计算比例和偏移以居中
      const scale = Math.min(
        width / (graphBounds.width + 100),
        height / (graphBounds.height + 100)
      );

      const translate = [
        width / 2 - (graphBounds.x + graphBounds.width / 2) * scale,
        height / 2 - (graphBounds.y + graphBounds.height / 2) * scale,
      ];

      // 应用变换 - 使用D3 v5兼容的语法
      this.svg
        .transition()
        .duration(500)
        .call(
          this.zoom.transform,
          d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
        );
    } catch (error) {
      console.error("居中图表时出错:", error);
    }
  }

  // 重置节点位置
  resetNodePositions() {
    this.draggedNodes.clear();
    this.render();
  }

  // 显示错误消息
  showErrorMessage(message) {
    // 清除现有内容
    this.linksGroup.selectAll("*").remove();
    this.nodesGroup.selectAll("*").remove();

    // 移除可能存在的旧错误消息
    this.svg.selectAll(".error-message").remove();

    // 显示错误消息
    this.svg
      .append("text")
      .attr("class", "error-message")
      .attr("x", "50%")
      .attr("y", "50%")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .style("font-size", "16px")
      .style("fill", "#d32f2f")
      .text(message);
  }

  // 添加箭头标记定义
  addArrowheadMarker() {
    // 检查是否已经添加
    if (this.svg.select("defs").empty()) {
      const defs = this.svg.append("defs");

      defs
        .append("marker")
        .attr("id", "arrowhead")
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 10)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", "#999");
    }
  }
}