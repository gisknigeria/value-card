# Bodija Value Card Platform Requirements

## Project Summary

The Bodija Value Card platform is a BERA-led resident identity, discount, loyalty, merchant directory, and community verification system for Bodija Estate. It starts as a digital-first QR card platform and can later support optional PVC cards, financial institution partnerships, and broader Smart Bodija services.

The first version should prove value with verified residents, approved merchants, QR/card verification, simple discounts, transaction logging, and basic admin oversight.

## Core Users

- Residents: verified Bodija residents who receive a digital card and access merchant benefits.
- Dependants: spouses, children, staff, or approved family members linked to a resident account.
- Merchants: approved businesses that offer discounts, credits, loyalty benefits, or fixed rates.
- Security staff: users who verify resident identity/status without seeing sensitive personal data.
- BERA admins: operators who approve residents, merchants, offers, renewals, suspensions, and reports.

## Card Rules

- Each verified resident receives a digital QR-enabled value card.
- Each card has a unique membership ID/card number.
- Each card has an expiry date.
- Cards expire after one year and must be renewed.
- Card status must be one of:
  - Active
  - Expired
  - Suspended
  - Pending verification
- Expired cards should not receive merchant benefits until renewed.
- Renewal should preserve the resident profile and membership history.
- Optional PVC cards can be introduced later, but live QR verification remains the main security layer.

## Merchant Benefit Rules

Merchants can choose the benefit model they can sustainably support.

Supported benefit types:

- Instant percentage discount, such as 5% or 10%.
- Fixed service rate, such as an agreed artisan/service fee.
- Free service benefit, such as free delivery or free consultation.
- Loyalty points.
- Merchant credit or voucher.
- Accumulated reward balance redeemable later at that merchant.

Merchants may choose either:

- Immediate discount: resident gets the discount during the purchase.
- Accumulated benefit: discount/reward is recorded and can be used later to buy something or redeem a merchant-approved benefit.

Accumulated merchant benefits should be merchant-specific unless BERA later approves cross-merchant rewards. This protects merchant finances and encourages repeat patronage.

## Merchant Discount Comparison Page

The platform should include a page where residents can compare merchant benefits.

The comparison should be by category, not by individual products.

Example categories:

- Supermarkets
- Pharmacies
- Restaurants
- Hotels
- Clinics
- Schools
- Laundry
- Salons
- Artisans and maintenance
- Security and CCTV
- Cleaning and waste
- Auto and repair
- Professional services

Each merchant comparison row should show:

- Merchant name
- Category
- Benefit type
- Discount or reward value
- Whether benefit is immediate or accumulated
- Redemption rule
- Expiry/validity of offer
- Location or service area
- Status: active, paused, or pending

Residents should be able to filter the comparison page by category and benefit type.

## MVP Features

### Resident Features

- Resident registration form.
- Consent/privacy acknowledgement.
- Admin verification flow.
- Digital card generation with QR code.
- Membership ID and expiry date display.
- Card renewal request.
- Merchant directory.
- Merchant discount comparison by category.
- Transaction/reward history.
- Complaint or dispute report.

### Merchant Features

- Merchant registration/onboarding.
- Merchant profile and business category.
- Offer/benefit setup.
- Choice of immediate or accumulated benefit model.
- Resident QR/card/phone verification.
- Transaction logging.
- Reward balance logging where applicable.
- Merchant dashboard with basic reports.

### Admin Features

- Resident approval and suspension.
- Merchant approval and suspension.
- Discount/offer approval.
- Card expiry and renewal management.
- Transaction audit trail.
- Complaint/dispute management.
- Basic reports for residents, merchants, scans, transactions, renewals, and popular categories.

### Security Verification Features

- QR scan or card/phone lookup.
- Show only minimal identity data needed for verification.
- Show card status: active, expired, suspended, or pending.
- Do not expose full residential address to merchants or security users unless explicitly approved.

## Data Needed

### Resident

- Full name
- Phone number
- Email address, optional
- Neighbourhood/cluster
- Member category
- Membership ID
- Card status
- Card issue date
- Card expiry date
- Renewal history
- Consent timestamp

### Merchant

- Business name
- Business category
- Contact person
- Phone number
- Location/service area
- Offer details
- Benefit type
- Redemption model: immediate or accumulated
- Offer status
- Approval status

### Transaction

- Resident/member ID
- Merchant ID
- Benefit used
- Purchase amount, optional for MVP
- Discount/reward value
- Redemption model
- Staff/merchant user who logged it
- Date/time
- Audit status

## Pilot Scope

- 50-100 residents.
- 10-20 merchants.
- 2-3 neighbourhood clusters.
- 6-10 service categories.
- Digital cards only at first.
- Simple merchant offers: percentage discount, fixed rate, free delivery/consultation, or loyalty stamp/reward.

## Important Product Decisions

- The first version should focus on trust, verification, discount logging, and visible resident value.
- Payments should remain outside the platform during MVP.
- Loyalty points are promotional rewards, not stored money.
- Merchant reward balances should not be treated as cash.
- BERA/admin approval is required before merchant offer changes go live.
- The platform should be mobile-friendly because merchants and residents will likely use phones.

