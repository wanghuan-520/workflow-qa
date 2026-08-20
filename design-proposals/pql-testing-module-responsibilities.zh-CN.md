# PQL Testing 模块职责总结

## 核心描述

> PQL 决定为什么测、测什么，并跟踪这次测试；Testing Packages 决定具体怎么测；Talos 和 Runtime 负责在哪里执行、如何执行。

## 模块职责

| 模块 | 核心职责 |
| --- | --- |
| PQL | 接收产品级测试目标，冻结测试上下文，选择测试资产，提交测试运行，跟踪运行状态并向用户展示测试结果。 |
| Testing Packages | 将已批准的测试输入编译为 StructuredPlan，定义 typed testing actions、断言和 CaseResult 等测试语义。 |
| Talos Testing Tool | 提供异步 Testing Tool 边界，创建和管理 QARun，并暴露 submit、get、events、cancel 等操作。 |
| Talos Scheduler | 根据机器能力和执行策略分配 TestingTask 与测试机器。 |
| talos-worker | 连接 Talos 调度系统和本机执行环境，领取任务并回传执行状态与结果引用。 |
| Local QA Runtime | 准备本机测试环境，驱动计划执行，管理本地资源、证据收集和清理。 |
| Browse / Session Engine | 提供实际的浏览器 Session 和 navigate、click、fill、observe、screenshot 等浏览器动作能力。 |

## 职责边界

- PQL 不直接执行浏览器动作，不选择机器，也不计算 Case Pass/Fail。
- Testing Packages 不负责机器调度、浏览器资源和本机环境生命周期。
- Talos 不解释测试断言和业务质量语义。
- Local QA Runtime 不决定测什么，只执行已经批准并编译完成的 StructuredPlan。
- Browse / Session Engine 只作为执行层能力使用，不承担测试选择、测试编排或质量判断。
