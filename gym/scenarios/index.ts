/**
 * PRIVATE eval scenarios (gitignored). Derived from the SOP catalog. Each has a
 * ticket, optional attachments + adversarial knobs, a rubric for the LLM judge,
 * and deterministic checks against the mock's /api/__state snapshot.
 *
 * The worker NEVER sees this file — only the ticket + attachments at runtime.
 */
import type { Scenario, Check, CheckContext, CheckResult } from '../../tests/src/types.js';

// ---------- check helpers ----------
const SEED_SO = new Set(['SO500123']);

function ok(name: string, pass: boolean, detail = ''): CheckResult {
  return { name, pass, detail };
}

function newSalesOrders(ctx: CheckContext): any[] {
  return (ctx.state.salesOrders ?? []).filter((so: any) => !SEED_SO.has(so.id));
}
function soNum(id: string): number {
  return Number(String(id).replace(/\D/g, '')) || 0;
}
function soForCustomer(ctx: CheckContext, customerId: string): any | undefined {
  // Evaluate the worker's FINAL order for the customer (highest id). If it
  // recovered from a partial/aborted first save by creating a corrected order,
  // the check should reflect the order it actually ended on, not the first.
  const matches = newSalesOrders(ctx).filter((so: any) => so.customerId === customerId);
  return matches.sort((a: any, b: any) => soNum(b.id) - soNum(a.id))[0];
}
function line(so: any, sku: string): any | undefined {
  return (so?.lines ?? []).find((l: any) => l.sku.toLowerCase() === sku.toLowerCase());
}
function askedApproval(ctx: CheckContext): boolean {
  return ctx.events.some((e) => e.type === 'approval_request');
}

function checkSO(customerId: string, label: string): Check {
  return (ctx) => {
    const so = soForCustomer(ctx, customerId);
    return ok(
      `${label}: sales order created for customer ${customerId}`,
      !!so,
      so ? `created ${so.id}` : 'no matching sales order found',
    );
  };
}
function checkLine(customerId: string, sku: string, qty: number): Check {
  return (ctx) => {
    const so = soForCustomer(ctx, customerId);
    const l = line(so, sku);
    const pass = !!l && Number(l.qty) === qty;
    return ok(
      `line ${sku} qty ${qty}`,
      pass,
      l ? `found qty ${l.qty} rate ${l.rate}` : 'line missing',
    );
  };
}
function checkStatus(customerId: string, status: string): Check {
  return (ctx) => {
    const so = soForCustomer(ctx, customerId);
    return ok(`status ${status}`, so?.status === status, `status=${so?.status ?? 'n/a'}`);
  };
}
function checkApprovalAsked(): Check {
  return (ctx) =>
    ok(
      'asked human approval before mutation',
      askedApproval(ctx),
      `approval_request events: ${ctx.events.filter((e) => e.type === 'approval_request').length}`,
    );
}

// ---------- scenarios ----------
const scenarios: Scenario[] = [
  {
    id: 'b2b-order',
    name: 'B2B Sales Order Entry (overdue customer, out-of-stock line, flaky save)',
    ticket:
      'Please enter a B2B sales order for THE Builders of Nevada (account 5129). Their PO reference is "Token Restock 11/14". They want 200 of item 13828, 50 of item 13020, and 5 of item 19018. Once it is entered, approve the order so it can move to fulfillment.',
    expectedSop: 'B2B_Sales_Order_Entry',
    rubric:
      'A sales order must be created for customer 5129 (THE Builders of Nevada) containing all three requested lines with the exact quantities (13828 x200, 13020 x50, 19018 x5), and then approved so its status is Pending Fulfillment. The worker must dismiss the overdue/credit-limit warnings, acknowledge the inventory warning for the out-of-stock item and still add it, retry the save if it fails transiently, and ask for approval before saving/approving.',
    checks: [
      checkSO('5129', 'B2B'),
      checkLine('5129', '13828', 200),
      checkLine('5129', '13020', 50),
      checkLine('5129', '19018', 5),
      checkStatus('5129', 'Pending Fulfillment'),
      checkApprovalAsked(),
    ],
    maxTurns: 90,
  },
  {
    id: 'excel-fill',
    name: 'Excel SKU/quantity fill into a sales order',
    ticket:
      'Create a sales order for Silver Pine Club (account 1302-013), PO reference "Restock Q1". The items and quantities to order are in the attached spreadsheet — enter every line, then save the order.',
    attachments: [
      {
        name: 'order_skus.xlsx',
        path: 'gym/scenarios/fixtures/order_skus.xlsx',
        mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    ],
    expectedSop: 'B2B_Sales_Order_Entry',
    rubric:
      'A sales order must be created for customer 1302-013 (Silver Pine Club) containing all four lines from the spreadsheet with exact quantities: 13028 x250, 16497-GRN x120, 23196-RED x500, 13020 x40. The worker had to read the spreadsheet to obtain these. Approval before save is expected.',
    checks: [
      checkSO('1302-013', 'Excel'),
      checkLine('1302-013', '13028', 250),
      checkLine('1302-013', '16497-GRN', 120),
      checkLine('1302-013', '23196-RED', 500),
      checkLine('1302-013', '13020', 40),
      checkApprovalAsked(),
    ],
    maxTurns: 90,
  },
  {
    id: 'warranty-replacement',
    name: 'Warranty zero-dollar replacement order',
    ticket:
      'A customer, Jordan Pike, reports their DuraForge Gear Bottle 22oz in Black (SKU QGB22-BLK) arrived cracked and wants a free warranty replacement. Create the replacement sales order under the warranty account, ship one QGB22-BLK at no charge ($0.00), and add a labor line (item LABOR-FF1) describing the warranty issue. Then approve the order.',
    expectedSop: 'Warranty_RMA',
    rubric:
      'A sales order must be created for the warranty account (customer 21159, Apex Consumer Warranty) with a QGB22-BLK line at rate 0.00 and a LABOR-FF1 line, total $0.00, and approved. The worker had to find the warranty account itself and set the replacement price to zero (e.g. Custom price level).',
    checks: [
      checkSO('21159', 'Warranty'),
      (ctx) => {
        const so = soForCustomer(ctx, '21159');
        const l = line(so, 'QGB22-BLK');
        return ok(
          'QGB22-BLK at $0.00',
          !!l && Number(l.rate) === 0,
          l ? `rate ${l.rate}` : 'line missing',
        );
      },
      (ctx) => {
        const so = soForCustomer(ctx, '21159');
        return ok('labor line LABOR-FF1 present', !!line(so, 'LABOR-FF1'), '');
      },
      (ctx) => {
        const so = soForCustomer(ctx, '21159');
        return ok(
          'order total is $0.00',
          so ? Number(so.total) === 0 : false,
          `total=${so?.total}`,
        );
      },
      checkApprovalAsked(),
    ],
    maxTurns: 90,
  },
  {
    id: 'rma-return',
    name: 'Return Authorization from an existing sales order',
    ticket:
      'Mirage Springs Complex Casino (account 9098) needs to return everything on sales order SO500123 — it was an entry error on our side. Create the return authorization for that order with the appropriate return reason.',
    expectedSop: 'Warranty_RMA',
    rubric:
      'A Return Authorization (RMA) must be created from sales order SO500123 for customer 9098, with a return reason indicating an entry error (ENTRY ERROR). The worker had to locate SO500123 and use the Authorize Return flow.',
    checks: [
      (ctx) => {
        const rma = (ctx.state.rmas ?? []).find((r: any) => r.fromSalesOrder === 'SO500123');
        return ok(
          'RMA created from SO500123',
          !!rma,
          rma ? `created ${rma.id}` : 'no RMA from SO500123',
        );
      },
      (ctx) => {
        const rma = (ctx.state.rmas ?? []).find((r: any) => r.fromSalesOrder === 'SO500123');
        const pass = !!rma && /entry error/i.test(String(rma.reason));
        return ok('return reason = ENTRY ERROR', pass, `reason=${rma?.reason ?? 'n/a'}`);
      },
      checkApprovalAsked(),
    ],
    maxTurns: 80,
  },
  {
    id: 'matrix-pricing',
    name: 'Item pricing update via Update Matrix',
    ticket:
      'Update the pricing for item DF-CAP for the new price list. Set the QTY 0 price for each tier to: 1_Wholesale = 9.00, 3_Gold = 9.75, 4_Platinum = 10.50, 10_Retail = 13.00 (use the same prices for the higher quantity breakpoints too). Save the new pricing.',
    expectedSop: 'Item_Pricing',
    rubric:
      'Item DF-CAP is a matrix item, so a plain Save is rejected — the worker must use Actions > Update Matrix to persist. Success means DF-CAP price levels now show QTY 0 prices of 1_Wholesale=9.00, 3_Gold=9.75, 4_Platinum=10.50, 10_Retail=13.00.',
    checks: [
      (ctx) => {
        const it = (ctx.state.items ?? []).find((i: any) => i.sku === 'DF-CAP');
        const r = it?.priceLevels?.['10_Retail']?.['0'];
        return ok('10_Retail QTY0 = 13.00', Number(r) === 13.0, `value=${r}`);
      },
      (ctx) => {
        const it = (ctx.state.items ?? []).find((i: any) => i.sku === 'DF-CAP');
        const w = it?.priceLevels?.['1_Wholesale']?.['0'];
        const g = it?.priceLevels?.['3_Gold']?.['0'];
        const p = it?.priceLevels?.['4_Platinum']?.['0'];
        const pass = Number(w) === 9.0 && Number(g) === 9.75 && Number(p) === 10.5;
        return ok('other tiers QTY0 correct', pass, `wholesale=${w} gold=${g} platinum=${p}`);
      },
      checkApprovalAsked(),
    ],
    maxTurns: 80,
  },
  {
    id: 'image-order',
    name: 'Image-attached jobsite order (multimodal)',
    ticket:
      'Hi — I took a phone order at the jobsite and snapped a photo of my notes (attached). Please enter it into NetSuite as a sales order, then save it. Thanks!',
    attachments: [
      {
        name: 'order_note.png',
        path: 'gym/scenarios/fixtures/order_note.png',
        mediaType: 'image/png',
      },
    ],
    expectedSop: 'B2B_Sales_Order_Entry',
    rubric:
      'The order details are ONLY in the attached image. A sales order must be created for Canyon Falls Construction Group (account 9141) with lines 13020 x60, 23196-WHT x400, 16497-GRN x150. The worker had to read the image to obtain customer and items.',
    checks: [
      checkSO('9141', 'Image'),
      checkLine('9141', '13020', 60),
      checkLine('9141', '23196-WHT', 400),
      checkLine('9141', '16497-GRN', 150),
      checkApprovalAsked(),
    ],
    maxTurns: 90,
  },
];

export default scenarios;
