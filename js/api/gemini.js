/**
 * gemini.js - AI Document & Statement Parsing Agent
 * Uses Google Gemini 2.5 Flash to parse messy Word docs, PDFs, Notepads,
 * spreadsheets, and images into structured Finance Planner data.
 */

import { DB } from '../db.js';

export const GeminiService = {
  DEFAULT_MODEL: 'gemini-2.5-flash',

  /**
   * Get configured Gemini API Key from settings or local storage
   */
  async getApiKey() {
    const keyFromDb = await DB.getSetting('geminiApiKey', '');
    if (keyFromDb) return keyFromDb;
    return localStorage.getItem('fp_gemini_key') || '';
  },

  /**
   * Save Gemini API Key
   */
  async setApiKey(key) {
    const cleanKey = (key || '').trim();
    await DB.setSetting('geminiApiKey', cleanKey);
    localStorage.setItem('fp_gemini_key', cleanKey);
    return cleanKey;
  },

  /**
   * System Prompt instructing the Agent to extract financial data
   */
  getSystemInstruction(currentPortfolio = []) {
    const portfolioContext = currentPortfolio && currentPortfolio.length > 0
      ? `\nCURRENT USER PORTFOLIO CONTEXT:
The user already has these holdings in their vault:
${currentPortfolio.map(a => `- "${a.name}" (${a.category}): current value ₹${a.currentValue || 0}`).join('\n')}
`
      : '';

    return `You are an expert Chartered Accountant and Personal Wealth Data Specialist.
Your job is to read and analyze ANY user financial document (broker holding statements, Excel, Word doc, Notepad text, CAMS/KFintech CAS statements, or ledgers).
You must extract all investment assets, monthly values/balances, and physical gold inventory.
${portfolioContext}
Rules:
1. Normalize Categories to strictly one of:
   - "equity_mf" (Mutual Funds, ETFs, Index Funds, ULIPs)
   - "equity_stock" (Direct Stocks, US Stocks, InvITs, REITs, equity shares)
   - "fixed_deposit" (Bank FDs, RDs, Term Deposits)
   - "bond" (PPF, EPF, Corporate Bonds, Government Bonds, LIC policies)
   - "gold" (Physical gold jewellery, coins, Sovereign Gold Bonds / SGB, Digital Gold)
   - "liquid_cash" (Savings Accounts, Emergency Cash, Broker uninvested cash)
2. Handling Decompositions / Replacement of Existing Holdings:
   - If the user instruction asks to "replace" or unpack an existing holding (for example, replacing the consolidated holding "nuvama" with individual stocks, bonds, SGBs, and InvITs from a statement):
     - Set "replaceHoldingNames": ["nuvama"] (the exact name(s) of the existing consolidated holding to delete).
     - Extract every individual instrument in the uploaded report into the "assets" array with its exact name, category, quantity/units, buyPrice, and currentValue.
3. Classify Financial Instruments Accurately:
   - SGB (Sovereign Gold Bonds) -> "gold"
   - InvITs (e.g. PowerGrid InvIT) and REITs -> "equity_stock"
   - Direct Indian or US shares -> "equity_stock"
   - Listed/Unlisted Bonds -> "bond"
4. Output STRICTLY VALID JSON conforming to the following structure:
{
  "summary": {
    "detectedFormat": "Short description of what was extracted (e.g. Nuvama holding statement with 14 stocks, 2 SGBs, 1 InvIT)",
    "currency": "INR",
    "monthsCount": 0,
    "assetsCount": 17
  },
  "replaceHoldingNames": ["nuvama"],
  "assets": [
    {
      "name": "Reliance Industries Ltd",
      "category": "equity_stock",
      "symbolOrCode": "RELIANCE.NS",
      "units": 10,
      "buyPrice": 2400,
      "currentPrice": 2950,
      "currentValue": 29500,
      "investedValue": 24000,
      "notes": "From broker statement"
    }
  ],
  "snapshots": [],
  "goldInventory": []
}
Do NOT include markdown backticks or explanations. Output pure JSON only.`;
  },

  /**
   * Parse plain text or copied notes via Gemini
   */
  async parseRawText(rawText, userInstructions = '', currentPortfolio = []) {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('Gemini API Key is missing. Please enter your free Google AI Studio key in Settings.');
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.DEFAULT_MODEL}:generateContent?key=${apiKey}`;

    let prompt = `Here is the user's raw financial record or statement:\n\n${rawText}\n\n`;
    if (userInstructions && userInstructions.trim()) {
      prompt += `USER INSTRUCTION: "${userInstructions.trim()}"\nPlease strictly honor this instruction when extracting holdings and setting replaceHoldingNames.\n\n`;
    }

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: this.getSystemInstruction(currentPortfolio) },
            { text: prompt }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new Error('Gemini returned an empty response.');
    }

    return JSON.parse(candidateText);
  },

  /**
   * Parse arbitrary document file via Multimodal Gemini
   */
  async parseDocumentFile(file, userInstructions = '', currentPortfolio = []) {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('Gemini API Key is missing. Please enter your free Google AI Studio key in Settings.');
    }

    // 1. If spreadsheet (Excel .xlsx, .xls), extract all sheets as text using SheetJS
    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      if (!window.XLSX) throw new Error('Spreadsheet engine is loading. Please try again in a moment.');
      const data = await file.arrayBuffer();
      const workbook = window.XLSX.read(data, { type: 'array' });
      let fullText = `Spreadsheet: ${file.name}\n\n`;
      for (const sheetName of workbook.SheetNames) {
        const ws = workbook.Sheets[sheetName];
        const csv = window.XLSX.utils.sheet_to_csv(ws);
        fullText += `=== SHEET: ${sheetName} ===\n${csv}\n\n`;
      }
      return await this.parseRawText(fullText, userInstructions, currentPortfolio);
    }

    // 2. If text / markdown / csv, read as text directly
    if (file.name.endsWith('.txt') || file.name.endsWith('.csv') || file.name.endsWith('.tsv') || file.name.endsWith('.md')) {
      const text = await file.text();
      return await this.parseRawText(text, userInstructions, currentPortfolio);
    }

    // 3. For PDFs and Images, send as multimodal inlineData
    let mimeType = file.type || 'application/octet-stream';
    if (file.name.endsWith('.pdf')) mimeType = 'application/pdf';
    else if (file.name.endsWith('.png')) mimeType = 'image/png';
    else if (file.name.endsWith('.jpg') || file.name.endsWith('.jpeg')) mimeType = 'image/jpeg';
    else if (file.name.endsWith('.webp')) mimeType = 'image/webp';

    // Convert file to base64
    const base64Data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.DEFAULT_MODEL}:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: this.getSystemInstruction(currentPortfolio) },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            },
            {
              text: `Analyze this attached document "${file.name}". Extract all financial holdings, values, monthly snapshots, and gold records into the structured JSON schema.` +
                (userInstructions && userInstructions.trim() ? `\n\nUSER INSTRUCTION: "${userInstructions.trim()}"\nPlease strictly follow this instruction and set replaceHoldingNames appropriately.` : '')
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new Error('Gemini returned an empty response.');
    }

    return this.cleanAndParseJson(candidateText);
  },

  /**
   * Helper to cleanly extract JSON even if wrapped in markdown codeblocks
   */
  cleanAndParseJson(rawText) {
    if (!rawText) throw new Error('Empty response from AI Agent.');
    let clean = rawText.trim();
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    }
    try {
      return JSON.parse(clean);
    } catch (err) {
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]);
      }
      throw new Error('Could not parse AI response as valid JSON.');
    }
  },

  /**
   * Analyze portfolio with market trends & analyst predictions for maximum growth
   */
  async analyzePortfolioGrowth(portfolioContext, { growthGoal = 'max_growth', customPrompt = '', currency = 'INR' } = {}) {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('Gemini API Key is missing. Please paste your free Google AI Studio key to activate the Finance Agent.');
    }

    const {
      holdings = [],
      summary = {},
      analytics = {},
      laggards = [],
      topPerformers = [],
      drift = {}
    } = portfolioContext;

    const goalLabels = {
      max_growth: 'Maximum Growth & Aggressive Alpha (Prioritize High-CAGR Equity & Outperforming Assets)',
      balanced_growth: 'Balanced Growth & Downside Protection (Optimal Sharpe Ratio, Growth with Strategic Debt/Gold Hedge)',
      momentum_alpha: 'High-Momentum Equity & Sectoral Alpha (Focus on Trending Sectors, Small/Mid-Caps & Breakout Assets)',
      defensive_compounding: 'Defensive Wealth Compounding & Capital Preservation (Steady Compounders, Fixed Income & Gold)'
    };

    const selectedGoalDesc = goalLabels[growthGoal] || goalLabels.max_growth;

    const portfolioSummaryText = `
PORTFOLIO FINANCIAL CONTEXT:
- Total Net Worth: ${currency} ${Math.round(summary.totalCurrentValue || 0).toLocaleString('en-IN')}
- Capital Invested: ${currency} ${Math.round(summary.totalInvested || 0).toLocaleString('en-IN')}
- Overall Compounding Return: ${(summary.returnPercentage || 0).toFixed(2)}% (${currency} ${Math.round(summary.totalProfit || 0).toLocaleString('en-IN')} profit)
- Asset Count: ${holdings.length} holdings
- Category Breakdown:
  * Equity (Mutual Funds + Stocks): ${currency} ${Math.round((summary.categoryBreakdown?.equity_mf || 0) + (summary.categoryBreakdown?.equity_stock || 0)).toLocaleString('en-IN')}
  * Fixed Income (FDs + Bonds/PPF): ${currency} ${Math.round((summary.categoryBreakdown?.fixed_deposit || 0) + (summary.categoryBreakdown?.bond || 0)).toLocaleString('en-IN')}
  * Gold: ${currency} ${Math.round(summary.categoryBreakdown?.gold || 0).toLocaleString('en-IN')}
  * Liquid Cash: ${currency} ${Math.round(summary.categoryBreakdown?.liquid_cash || 0).toLocaleString('en-IN')}

HOLDING DETAILS:
${holdings.map((h, i) => `${i + 1}. "${h.name}" | Category: ${h.category} | Invested: ${currency} ${Math.round(h.investedValue || 0)} | Current Value: ${currency} ${Math.round(h.currentValue || 0)} | Return: ${(h.returnPercentage || 0).toFixed(1)}% | Ticker/Symbol: ${h.symbolOrCode || 'N/A'}`).join('\n')}

LAGGARDS / UNDERPERFORMERS DETECTED:
${laggards.length > 0 ? laggards.map(l => `- "${l.name}": Return ${(l.returnPct || 0)}% (Trailing bank FD hurdle rate of 7.0%)`).join('\n') : 'None flagged by automated filters.'}

TOP PERFORMERS / WEALTH DRIVERS:
${topPerformers.length > 0 ? topPerformers.map(t => `- "${t.name}": Return ${(t.returnPct || 0)}%`).join('\n') : 'None.'}
`;

    const systemPrompt = `You are the Chief Investment Strategist and Quantitative Wealth Growth Agent for Finance Planner.
Your job is to provide an elite, institutional-quality portfolio growth audit and growth action plan.

YOUR MANDATE:
1. EVALUATE THE USER'S CURRENT PORTFOLIO:
   - Identify dead/lagging capital dragging down compounding.
   - Detect concentration risks, fund overlap, or under-allocation to high-growth sectors.
2. SYNTHESIZE CURRENT MARKET TRENDS & RECENT ANALYST PREDICTIONS:
   - Factor in current macro trends: Indian (Nifty 50, Sensex, Mid/Small-cap valuations) and Global markets, monetary policy/interest rates, and corporate earnings trajectory.
   - Factor in recent analyst consensus and institutional ratings for sectors (e.g. IT/AI, Capital Goods/Manufacturing, Private Banking, Healthcare, Green Energy) and fund categories.
   - Assess commodity & gold dynamics (SGBs, spot gold tailwinds as a non-correlated hedge).
3. FORMULATE CONCRETE CHANGES FOR MAXIMUM GROWTH:
   - Primary Objective: ${selectedGoalDesc}.
   - Classify EVERY active holding into a clear action verdict:
     * "ACCUMULATE": High growth potential, bullish analyst view, strong compounding engine.
     * "CORE HOLD": High-quality long-term compounder, maintain weight.
     * "TRIM / PROFIT BOOK": Stretched valuations or overweight cyclical risk; lock in gains to redeploy.
     * "EXIT & SWITCH": Underperforming dead capital; exit and channel into superior high-CAGR assets.
   - Provide a step-by-step Capital Redeployment Plan detailing exact moves (e.g. "Sell ₹X of laggard Y, deploy into top Flexi-cap or Mid-cap Z").
   - Provide recommended fresh monthly salary/SIP allocation percentages.
   - Calculate estimated CAGR lift (before vs after optimization).

OUTPUT REQUIREMENTS:
You MUST respond with STRICTLY VALID JSON conforming EXACTLY to this schema (no markdown, no preamble):
{
  "marketOutlook": {
    "sentiment": "Bullish",
    "marketPhase": "e.g. Broad-Based Market Expansion / Sector Rotation",
    "keyDrivers": [
      "Driver 1 with current context",
      "Driver 2 with current context",
      "Driver 3 with current context"
    ],
    "analystConsensusSummary": "Synthesized consensus of leading institutional analysts on market direction, sector leadership, and growth catalysts."
  },
  "growthAudit": {
    "growthScore": 82,
    "efficiencyScore": 76,
    "deadCapitalAmount": 50000,
    "coreVerdict": "Concise 1-2 sentence assessment of overall portfolio growth capability and main bottlenecks."
  },
  "holdingVerdicts": [
    {
      "name": "Exact Name of Holding",
      "category": "equity_mf",
      "currentValue": 120000,
      "allocationPct": 18.5,
      "verdict": "ACCUMULATE",
      "badge": "Strong Overweight",
      "analystConsensus": "Analyst targets and consensus view on this asset or fund category",
      "actionRationale": "Specific why and how to handle this asset for maximum compounding",
      "targetWeightPct": 22.0
    }
  ],
  "capitalRedeploymentPlan": [
    {
      "stepNumber": 1,
      "actionType": "TRIM_OR_EXIT",
      "title": "Exit Laggard Asset",
      "description": "Specific action to liquidate or trim underperforming asset to free up capital."
    },
    {
      "stepNumber": 2,
      "actionType": "REDEPLOY_GROWTH",
      "title": "Channel into High-Alpha Growth",
      "description": "Specific high-growth asset or fund category to deploy liberated capital into."
    },
    {
      "stepNumber": 3,
      "actionType": "SIP_OPTIMIZATION",
      "title": "Optimize Future Salary SIPs",
      "description": "How to distribute future monthly savings for maximum compounding."
    }
  ],
  "sipStrategy": {
    "recommendedEquityPct": 70,
    "recommendedDebtPct": 15,
    "recommendedGoldPct": 10,
    "recommendedCashPct": 5,
    "monthlyFocusRecommendation": "Clear guidance on where the investor's next monthly paycheck savings should be directed."
  },
  "compoundingProjection": {
    "currentEstimatedCAGR": "12.0%",
    "optimizedCAGR": "15.2%",
    "projected3YearAlphaLift": "+3.2% CAGR Boost",
    "projected3YearWealthDelta": "Estimated ₹1.5L - ₹2.5L additional compounding gains over 36 months"
  },
  "executiveCommentary": "In-depth, inspiring 2-3 paragraph strategic briefing summarizing market positioning, tactical shifts for maximum growth, and long-term wealth compounding perspective."
}`;

    const userPrompt = `Please analyze my current investment portfolio and recommend strategic changes for MAX GROWTH according to the goal "${selectedGoalDesc}".\n\n${portfolioSummaryText}` +
      (customPrompt && customPrompt.trim() ? `\n\nINVESTOR CUSTOM QUESTION / SPECIFIC FOCUS:\n"${customPrompt.trim()}"\nPlease directly address this question in your recommendations and executive commentary.` : '');

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.DEFAULT_MODEL}:generateContent?key=${apiKey}`;

    // Attempt 1: Grounded with Google Search for real-time market trends & analyst views
    try {
      const groundedBody = {
        contents: [
          {
            role: 'user',
            parts: [
              { text: systemPrompt },
              { text: userPrompt }
            ]
          }
        ],
        tools: [{ googleSearch: {} }],
        generationConfig: {
          temperature: 0.2
        }
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(groundedBody)
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n');
        if (text && text.trim()) {
          return this.cleanAndParseJson(text);
        }
      }
    } catch (searchErr) {
      console.warn('Grounded search generation fallback:', searchErr);
    }

    // Attempt 2: Standard JSON mode without search tool
    const standardBody = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: systemPrompt },
            { text: userPrompt }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(standardBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new Error('Finance Agent returned an empty analysis.');
    }

    return this.cleanAndParseJson(candidateText);
  },

  /**
   * Ask follow-up question to Finance Agent regarding the analysis
   */
  async askFinanceAgentFollowup(question, previousAnalysis, portfolioSummary = {}) {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new Error('Gemini API Key is missing.');

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.DEFAULT_MODEL}:generateContent?key=${apiKey}`;

    const prompt = `You are the Finance Planner Growth Agent.
PREVIOUS ANALYSIS REPORT:
- Market Sentiment: ${previousAnalysis?.marketOutlook?.sentiment || 'Bullish'}
- Growth Score: ${previousAnalysis?.growthAudit?.growthScore || 'N/A'}/100
- Core Verdict: ${previousAnalysis?.growthAudit?.coreVerdict || ''}
- Compounding Lift: ${previousAnalysis?.compoundingProjection?.projected3YearAlphaLift || ''}
- Total Net Worth: ₹${Math.round(portfolioSummary.totalCurrentValue || 0).toLocaleString('en-IN')}

THE INVESTOR HAS THIS FOLLOW-UP QUESTION:
"${question}"

Provide a concise, direct, highly actionable answer based on current market trends, analyst views, and optimal compounding principles. Format with clean markdown, bullet points, and clear takeaways.`;

    const requestBody = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error('Failed to get answer from Finance Agent.');
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
  }
};
