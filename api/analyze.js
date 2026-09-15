export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'No invoice text provided' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const prompt = `Analyze this invoice text and extract the following information. For each item, respond with ONLY "YES" if clearly present, "NO" if missing or unclear, or "UNCLEAR" if ambiguous:

1. Invoice Number - Is there a clear, unique invoice number/identifier?
2. Invoice Date - Is there a clear invoice date (in any format)?
3. VAT Number - Is there a VAT registration number present?
4. Supplier Address - Is there a complete supplier/vendor address?
5. Customer Address - Is there a customer/buyer address?
6. Description - Is there a clear description of goods/services (not just generic "services" text)?
7. Total Amount - Is there a clear total amount?
8. Metadata Check - Does this look like a professionally created invoice, or does it seem like it was created in a design tool?

Format your response as:
Invoice Number: [YES/NO]
Invoice Date: [YES/NO]
VAT Number: [YES/NO]
Supplier Address: [YES/NO]
Customer Address: [YES/NO]
Description: [YES/NO]
Total Amount: [YES/NO]
Professional Invoice: [YES/NO]

Invoice Text:
${text.substring(0, 5000)}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    const responseText = data.contents[0].parts[0].text;

    // Parse response
    const lines = responseText.split('\n');
    const checks = {};
    lines.forEach(line => {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        checks[key.trim()] = value.trim();
      }
    });

    // Calculate risk score
    let riskScore = 0;
    let passCount = 0;
    const checkResults = [];

    const mapping = [
      { key: 'Invoice Number', isLaw: true },
      { key: 'Invoice Date', isLaw: true },
      { key: 'VAT Number', isLaw: false },
      { key: 'Supplier Address', isLaw: true },
      { key: 'Customer Address', isLaw: true },
      { key: 'Description', isLaw: true },
      { key: 'Total Amount', isLaw: true },
      { key: 'Professional Invoice', isLaw: false }
    ];

    mapping.forEach(item => {
      const
