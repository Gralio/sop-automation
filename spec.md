# SOP automation spec

We are building a claude sdk based automation tool. It is unusual because we intend to prove that you can automatically generate automations based on observed, screen based work and validate them against a generated mock environment which is designed to be browser agent hostile. The automation agent has the ability to perform tasks specified in a SOP document and use a real chrome browser to perform work. I will be calling claude Opus the solution builder and claude sonnet the agentic worker. The task of the worker is to receive some ticket or instruction, then find the correct SOP from a catalog and follow the process. The process typically represents a messy, real life, back office process like order entry, payroll calculation, formatting and uploading excel files or similar. The kind of process that has resisted software based automation because it requires judgement and adaptability. The SOPs have been generated in such a way that they cover many edge cases but leave room for interpretation. The worker is expected to not perform the task in a rigid way but to explore his browser environment and go through the steps of the SOP in a loop until human approval becomes necessary. 

## Inputs
The builder will have access to the following files in the inputs folder
* obfuscated and PII redacted screenshots of a netsuite environment 
* Transcripts of work performed by an employee on a computer screen. Including clicks and inputs and partial descriptions of screen contents in markdown format
* A catalog of SOP documents that have been created by observing the work in all it’s variations 
* browser automation solution to be used, pls read it and vendor it: https://github.com/browser-use/browser-harness
* claude sdk node: https://github.com/anthropics/claude-agent-sdk-typescript docs: https://code.claude.com/docs/en/agent-sdk/overview 
Start by exploring the inputs

## Tech stack
We use claude sdk with Sonnet as the driving model. The browser can be accessed via browser-harness. The UI should be made in sveltekit typescript and the the e2e tests run against headless chrome. 
Claude sdk already comes with built in tools like reading, editing files and executing scripts. In addition we need to provide the following extensions tools:
* browser: allows to interact with the harness process via python snippets or paths to python files
* Send_to_user: Between tool calls, when you have content the user must read verbatim (a partial deliverable, a direct answer to their question), call the send_to_user tool with that content. Use send_to_user only for user-facing content, not for narration or reasoning.
* Ask_approval: before a mutation is submitted or a significant final action is taken (for example money transfer) prompt the user with this tool before proceeding. A rejection should interrupt the conversion. 

## Implementation plan 
1. project setup, claude.md, linters
2. Start by creating a mock netsuite implementation based on screenshots and transcripts. It will be used to test our worker against by giving him various tasks to solve. After every test run, you will inspect the agents behaviour and make decisions weather to extend the mock environment or male improvements to the worker or its prompts. 
3. Implement the worker agent and wire it up with all its tools. It should be instructed about the location of the SOP files with a mandate to follow them. But it cannot access transcripts. 
4. Create a chat ui for the worker. The chat starts by the user submitting a ticket. Then the worker runs his loop and streams tool calls and thoughts to the ui. The ui should per default collapse those into expandable groups. Only when the agent submits the send_to_user tool should a message break the grouping and become visible. The same applies to the final text output before the agent stops his loop. The ui shows the selected SOP file via rendered markdown, the worker needs to communicate which SOP is being followed. Verify the ui via tests. 
* Derive test cases from the SOPs, code them and execute the worker against against the tests. Use sonnet as an llm judge to evaluate the execution outcomes and provide feedback. 
* Iterate on the mock netsuite, the worker implementation and the tests until they pass. Ensure that the worker has no specific solutions encoded in his prompts, only generic instructions about his nature and purpose. The worker must derive solutions every time when given a new task. 


Mock, worker agent and test suite should be implemented via parallel workers (just establish basic contracts beforehand), then review each adverserially before executing tests

## Additional requirements
Important: the mock netsuite implementation must be gitignored and not be part of the public repo. we’re submitting the code for a hackathon and it will all be public except for the transcripts, sops, screenshots and the mock gym. internet users will still be able to download the agent worker code and use with their own SOPs.

the mock-builder must be adversarial by construction: random latency, intermittent save failures, confirmation modals, paginated tables, near-duplicate records, conditionally appearing fields and other hindrances should be built into the mock to emulate a real life shoddy ERP. the implementation agents of the builder agent should be unaware of those traps

Test scenarios should include a case where an excel file containing SKUs and quantities is attached to the chat. The agent needs to read the excel and fill a list of items in a sales order

it is possible to attach images to the chat and the worker can read them in a native, multimodal way supported by Claude. I want to be able to paste an image together with text that i’ve copied from my apple notes into the chat input. it should prompt the agent worker and provide him with the image attachment

Setup linters and code formatters according to best practices and setup a brief claude.md file with instructions and brief coding and architecture guidelines, so that the implementing agents produce cleaned up and linted code.

For the purposes of the demo it is ok that the worker agent receives the URL of the mock ERP in its prompt context. 
