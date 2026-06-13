## SOP automation based on observation

This repo shows that you can automate any browser based backoffice process using Claude SDK, and create a working, reliable and verified agentic automation within a day. All you need is context (observations how work gets done).
The agent follows SOPs (Standard Operating Procedures) to perform a process exactly as its being done at a specific company. The automation is fully open soure.

The solution is closer to a digital intern / agentic coworker than traditional automation because:
* the automation builds itself per task, based on a SOP, within 1 minute 
* it adapts to previously unknown edge cases
* it self-repairs
* it is more reliable because it understands the broader context of the company

The blueprint for the automation solution is encoded in [spec.md](spec.md)

Claude Opus 4.8 in ultracode mode, implemented:
* a mock ERP, built from scratch based on screenshots
* an e2e test suite that tests the agent based on SOPs 
* a working agent that can be demonstrated on test inputs which it has never seen before

Claude was kicked off with this prompt: 
```
/goal The goal is to implement, review, test and validate @spec.md. Use dynamic workflows. Keep iterating until you can validate that the agent worker can perform SOP related tickets against the mock environment with a high success rate. The mock environment must be closely resembling  the screenshots and supports all mock test scenarios. Multiple qualitative test cases have been developed and successfully executed. Claude has worked diligently and made no shortcuts nor fake implementations. Issues in the agents implementation have been found and addressed in a generic way, such that the agent worker has absolutely no prior knowledge about the task or environment that it will be executed against, it must learn how to solve the challange by itself, every time.
```

Then one more prompt for polish:
/frontend-design explore the design of the agent worker ui via headless browser, then make it beautiful, minmalistic, functional, easy to understand and user friendly with a light and modern theme. Explore multiple designs in parallel, then use a judge to pick the best one. Implement the best design, review and validate it. Execute the full test suite to ensure it is still handing all cases.
