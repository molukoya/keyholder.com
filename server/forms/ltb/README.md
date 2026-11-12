# Ontario's official LTB forms

Tribunals Ontario's own forms, from https://tribunalsontario.ca/ltb/forms/ (downloaded 2026-11-12):

| File | Form | Version |
| --- | --- | --- |
| N4.pdf | Notice to End your Tenancy Early for Non-payment of Rent | N4 (2026/09) |
| N1.pdf | Notice of Rent Increase | v. 01/04/2022 |
| N2.pdf | Notice of Rent Increase (Unit Partially Exempt) | v. 01/04/2022 |
| N5.pdf | Notice to End your Tenancy for Interfering with Others, Damage or Overcrowding | N5 (2026/09) |
| N12.pdf | Notice to End your Tenancy Because the Landlord, a Purchaser or a Family Member Requires the Rental Unit | N12 (2026/10) |
| N11.pdf | Agreement to End the Tenancy | v. 01/04/2022 |

The published files open with an empty password and allow filling in their fields. Each was opened once with that
password and saved without it, so the server can fill the fields (`server/officialForms.ts`). Nothing else changes:
every page renders identically to the published form. What goes in each field is in `src/lib/ltbForms.ts`.

When Tribunals Ontario publishes a new version: download it, open it the same way, check its field names
(`server/officialForms.test.ts` fails on any field that is no longer there), and update `OFFICIAL` in
`src/lib/ltbForms.ts` with the new version.

```python
import pymupdf  # PyMuPDF; keeps every field's settings intact
d = pymupdf.open('N4-published.pdf'); d.authenticate('')
d.save('N4.pdf', encryption=pymupdf.PDF_ENCRYPT_NONE, deflate=True)
```
