# SOP: B2B Sales Order Entry Process - Customer Service

## Metadata

| Field | Details |
|-------|---------|
| **Department** | Sales / Customer Service |
| **Process Owner** | CSR Team |
| **Frequency** | Daily |
| **Tools Used** | Microsoft Outlook, Oracle NetSuite |
| **Last Updated** | 2025-11-20 |

## 1.0 What's this Process For?

This SOP ensures the accurate and timely entry, fulfillment, and billing of B2B sales orders received from sales representatives and wholesale construction accounts.

- **Trigger 1:** When a new B2B order or quote is received via email or phone.
- **Trigger 2:** When a sales representative submits an order on behalf of a wholesale account.

## 2.0 Who's Involved in This Process?

### Stakeholder Table

| R/A/C/I | Team/Role | Primary Responsibilities |
|---------|-----------|--------------------------|
| **Responsible** | CSR Team | Receiving order, entering into NetSuite, handling warnings, and processing billing. |
| **Accountable** | Customer Service Manager | Ensuring SLA for order entry and accuracy is met. |
| **Consulted** | Sales Representatives | Clarifying order details or custom requirements. |
| **Informed** | Customer | Receiving quotes, proofs, and shipping notifications. |

## 3.0 Background & Key Considerations

- Orders are often received via email with a Purchase Order or via direct phone call.
- Warning popups for inventory shortages and credit limits are common and must be handled per policy.
- Ensure the appropriate location and source are tracked so fulfillments are routed to the proper warehouse.

## 4.0 How to Enter a B2B Sales Order

### Step 1: Receive and Review Order

**Who:** CSR Team

**How:** Review the incoming order details from the email or phone call.

1. Open Microsoft Outlook and locate the order details in your inbox or specific customer folder.
2. Review the items, quantities, pricing, and shipping address requested.

### Step 2: Search for the Customer in NetSuite

**Who:** CSR Team

**How:** Access the specific customer record to begin the order.

1. Navigate to Oracle NetSuite in your web browser and enter your email address (e.g., `name@apexsupply.com`).
2. Click **Log In**. If prompted for Two-Factor Authentication, enter your 6-digit verification code and click **Submit** to load the NetSuite dashboard.
3. In the Global Search bar at the top of the screen, type the customer name, account number, or contact name (e.g., "the supply yard" or "lubbock").
4. Select the matching Customer record from the dropdown results.

### Step 3: Create the Sales Order and Fill Out Header Details

**Who:** CSR Team

**How:** Initiate the sales order transaction and enter metadata.

1. On the Customer record dashboard, click the **Actions** dropdown and select **Sales Order**, or click the **Create Sales Order** button directly.
2. *Credit Limit Warning:* If the customer is overdue or over their credit limit, a warning dialog box will appear. Click **OK** to dismiss it and proceed.
3. Fill in the **ORDER PLACED BY** field with the contact's name.
4. Enter the **PO # / REF** if provided.
5. Select the appropriate **SOURCE** and **LOCATION** if they did not auto-populate.

### Step 4: Enter Line Items and Handle Warnings

**Who:** CSR Team

**How:** Add requested items to the order.

1. Scroll down to the **Items** subtab.
2. Type the item number or description into the **ITEM** field and select the matching inventory item from the dropdown list.
3. Enter the requested quantity into the **QTY ORD** field.
4. Click **Add** to insert the line item into the order.
5. *Inventory Warning:* If a popup states availability issues (e.g., "only X available"), click **OK** to acknowledge and continue adding the item.
6. Repeat this process for all requested items.
7. Scroll back up to the top or bottom of the form and click **Save** to create the Sales Order.

### Step 5: Approve and Confirm the Order

**Who:** CSR Team

**How:** Move the order to fulfillment status.

1. Once the Sales Order saves successfully, verify the status at the top. It may say **PENDING APPROVAL**.
2. If approval is needed, click the **Actions** dropdown and select **Approve Order** (or click the Approve button). The status will update to **PENDING FULFILLMENT**.
3. Switch back to Microsoft Outlook and reply to the customer or sales representative confirming the order has been entered.

## 5.0 Handling Exceptions & Edge Cases

- **Credit Limit Holds:** Even if you click "OK" on the warning during entry, the order may go on Credit Hold. If a customer demands immediate shipment, you may need to email Accounts Receivable to request a hold release.
- **Backorders:** If an item's committed quantity is zero, the order will partially fulfill. Monitor backorders or communicate with the customer about expected ship dates.
- **Custom Logo Orders:** For customized items, a separate Jotform (Custom Order Load) might need to be submitted with proof details, and vendors may send proofs via email requiring approval before production.

## 6.0 Where to Get Help

- **Process Questions:** Customer Service Manager
- **Technical Issues:** NetSuite Administrator
- **Escalations:** Accounts Receivable (for releasing credit holds)

## 7.0 Performance Monitoring

| Type | Name | Definition and Target |
|------|------|----------------------|
| **SLA** | Order Entry Turnaround | 100% of standard orders entered within 24 hours of receipt. |
| **KPI** | Order Accuracy | Less than 1% error rate in order entry details. |

## 8.0 Related Resources

| Category | Link |
|----------|------|
| System | Oracle NetSuite |
| System | Microsoft Outlook |
