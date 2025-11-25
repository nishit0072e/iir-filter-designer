import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { Settings, Play, Info, AlertTriangle, Share2, Sparkles, MessageSquare, Loader2, ArrowRight } from 'lucide-react';

// --- STYLES ---
const styles = `
  body { margin: 0; min-width: 320px; min-height: 100vh; }
`;

// --- MATH & PARSING UTILITIES ---

const EPSILON = 1e-10;

const parseEquation = (eq) => {
  try {
    const cleanEq = eq.replace(/\s+/g, '').toLowerCase();
    const [lhs, rhs] = cleanEq.split('=');
    
    if (!lhs || !rhs) throw new Error("Equation must have a '=' sign.");

    const parseSide = (str, variable) => {
      const regex = new RegExp(`([+-]?)([\\d\\.]*)?\\*?${variable}\\(n(?:-(\\d+))?\\)`, 'g');
      const coeffs = [];
      let match;
      
      while ((match = regex.exec(str)) !== null) {
        const sign = match[1] === '-' ? -1 : 1;
        let valStr = match[2];
        let delay = match[3] ? parseInt(match[3]) : 0;
        
        let val = 1;
        if (valStr && valStr !== '') val = parseFloat(valStr);
        
        coeffs[delay] = (coeffs[delay] || 0) + (sign * val);
      }
      for(let i=0; i<coeffs.length; i++) {
        if(coeffs[i] === undefined) coeffs[i] = 0;
      }
      return coeffs;
    };

    let a = parseSide(lhs, 'y'); // Denominator
    let b = parseSide(rhs, 'x'); // Numerator

    if (Math.abs(a[0]) > EPSILON) {
      const norm = a[0];
      a = a.map(v => v / norm);
      b = b.map(v => v / norm);
    } else {
      if (a.length === 0) a = [1];
      else throw new Error("Coefficient of y(n) cannot be zero.");
    }
    
    return { a, b };
  } catch (e) {
    return { error: e.message };
  }
};


// --- DRAWING CONSTANTS & HELPERS ---

const THEME = {
  stroke: "#334155", // Slate 700
  highlight: "#2563eb", // Blue 600
  text: "#0f172a", // Slate 900
  bg: "#ffffff",
  grid: "#e2e8f0"
};

const SVG_WIDTH = 900;
const SVG_HEIGHT = 700;

// Components

const Text = ({ x, y, children, className = "text-[11px] font-medium fill-slate-700 font-mono", anchor="middle", baseline="middle" }) => (
  <text x={x} y={y} textAnchor={anchor} dominantBaseline={baseline} className={className}>{children}</text>
);

const Junction = ({ x, y }) => (
  <circle cx={x} cy={y} r={3} fill={THEME.stroke} />
);

const Adder = ({ x, y }) => (
  <g>
    <circle cx={x} cy={y} r={14} fill="white" stroke={THEME.stroke} strokeWidth="2" />
    <path d={`M ${x-8} ${y} L ${x+8} ${y} M ${x} ${y-8} L ${x} ${y+8}`} stroke={THEME.stroke} strokeWidth="2" strokeLinecap="round" />
  </g>
);

const Delay = ({ x, y }) => (
  <g>
    <rect x={x-24} y={y-20} width={48} height={40} fill="white" stroke={THEME.highlight} strokeWidth="2" rx="4" />
    <Text x={x} y={y} className="text-xs font-bold fill-blue-600">z⁻¹</Text>
  </g>
);

const Gain = ({ x, y, val, direction = "right" }) => {
  // Triangle pointing in direction
  let points = "";
  let textX = x;
  let textY = y - 20;
  
  if (direction === "right") {
    points = `${x-15},${y-15} ${x+15},${y} ${x-15},${y+15}`;
    textX = x;
    textY = y - 22;
  } else if (direction === "left") {
    points = `${x+15},${y-15} ${x-15},${y} ${x+15},${y+15}`;
    textX = x;
    textY = y - 22;
  } else if (direction === "down") {
    points = `${x-15},${y-15} ${x+15},${y-15} ${x},${y+15}`;
    textX = x + 24;
    textY = y;
  } else if (direction === "up") {
    points = `${x-15},${y+15} ${x+15},${y+15} ${x},${y-15}`;
    textX = x + 24;
    textY = y;
  }

  return (
    <g>
      <polygon points={points} fill="white" stroke={THEME.highlight} strokeWidth="2" />
      <Text x={textX} y={textY} className="text-[10px] font-bold fill-slate-500">{val}</Text>
    </g>
  );
};

// Orthogonal Wire
const Wire = ({ points, markerEnd = true }) => {
  if (points.length < 2) return null;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return (
    <path 
      d={d} 
      stroke={THEME.stroke} 
      strokeWidth="2" 
      fill="none" 
      markerEnd={markerEnd ? "url(#arrowhead)" : ""}
      strokeLinejoin="round"
    />
  );
};


// --- ADVANCED STRUCTURE RENDERERS ---

const DirectFormI = ({ b, a }) => {
  // Standard DF-I: 
  // Left Column: Input delays
  // Right Column: Output delays
  // Center: Summation spine
  
  const M = b.length - 1;
  const N = a.length - 1;
  const stages = Math.max(M, N);
  
  const startX = 150;
  const startY = 100;
  const colSpacing = 240;
  const rowSpacing = 80;
  
  const inputX = startX;
  const outputX = startX + colSpacing * 2;
  const sumX = startX + colSpacing;

  const els = [];

  // --- Input & Output Labels ---
  els.push(<Text x={inputX - 40} y={startY} key="lbl-x" className="text-sm font-bold">x(n)</Text>);
  els.push(<Text x={outputX + 40} y={startY} key="lbl-y" className="text-sm font-bold">y(n)</Text>);
  
  // Initial wire x(n) -> first b0 gain tap point
  els.push(<Wire points={[{x: inputX - 25, y: startY}, {x: inputX, y: startY}]} markerEnd={false} key="wire-in" />);
  
  // Output wire sum -> y(n)
  els.push(<Wire points={[{x: sumX, y: startY}, {x: outputX, y: startY}]} markerEnd={true} key="w-sum-out" />);
  
  // Left Delay Chain (Input)
  for (let i = 0; i <= M; i++) {
    const y = startY + i * rowSpacing;
    
    // Vertical wire segments for delays
    if (i < M) {
      els.push(<Wire points={[{x: inputX, y: y}, {x: inputX, y: y + rowSpacing}]} markerEnd={true} key={`w-dx-${i}`} />);
      els.push(<Delay x={inputX} y={y + rowSpacing / 2} key={`d-x-${i}`} />);
    }
    
    // Tap off to gain
    els.push(<Junction x={inputX} y={y} key={`j-x-${i}`} />);
    els.push(<Wire points={[{x: inputX, y: y}, {x: sumX - 40, y: y}]} markerEnd={true} key={`w-gx-${i}`} />);
    els.push(<Gain x={inputX + colSpacing/2} y={y} val={`b${i}`} direction="right" key={`g-x-${i}`} />);
  }

  // Right Delay Chain (Output)
  for (let i = 1; i <= N; i++) {
    const y = startY + i * rowSpacing;
    
    // Vertical wire segments going DOWN from y(n)
    const prevY = startY + (i-1) * rowSpacing;
    els.push(<Wire points={[{x: outputX, y: prevY}, {x: outputX, y: y}]} markerEnd={true} key={`w-dy-${i}`} />);
    els.push(<Delay x={outputX} y={prevY + rowSpacing / 2} key={`d-y-${i}`} />);
    
    // Tap off to gain going LEFT
    els.push(<Junction x={outputX} y={y} key={`j-y-${i}`} />);
    els.push(<Wire points={[{x: outputX, y: y}, {x: sumX + 20, y: y}]} markerEnd={true} key={`w-gy-${i}`} />);
    // Gain value is -a_k
    els.push(<Gain x={outputX - colSpacing/2} y={y} val={`-a${i}`} direction="left" key={`g-y-${i}`} />);
  }

  // Central Summation Spine
  for (let i = stages; i >= 0; i--) {
    const y = startY + i * rowSpacing;
    const hasLeft = i <= M;
    const hasRight = i <= N && i > 0;
    
    if (i === 0) {
      // Top adder (final sum)
      els.push(<Adder x={sumX} y={startY} key={`add-${i}`} />);
      // If there are stages below, connect up
      if (stages > 0) els.push(<Wire points={[{x: sumX, y: startY + rowSpacing - 15}, {x: sumX, y: startY + 15}]} markerEnd={true} key={`w-spine-${i}`} />);
    } else {
      if (hasLeft || hasRight) {
        els.push(<Adder x={sumX} y={y} key={`add-${i}`} />);
        // Wire to adder above
        if (i > 1 || (i===1)) { // always go up if not top
             els.push(<Wire points={[{x: sumX, y: y - 15}, {x: sumX, y: y - rowSpacing + 15}]} markerEnd={true} key={`w-spine-up-${i}`} />);
        }
      }
    }
  }

  return <g>{els}</g>;
};

const DirectFormII = ({ b, a }) => {
  // Canonical Form
  
  const N = Math.max(a.length, b.length) - 1;
  const cx = SVG_WIDTH / 2;
  const startY = 80;
  const rowSpacing = 90;
  const sideWidth = 180;
  
  const els = [];
  
  // Input/Output Text
  els.push(<Text x={cx - sideWidth - 60} y={startY} key="t-in" className="text-sm font-bold">x(n)</Text>);
  els.push(<Text x={cx + sideWidth + 60} y={startY} key="t-out" className="text-sm font-bold">y(n)</Text>);

  // Input Wire to Top Adder
  els.push(<Wire points={[{x: cx - sideWidth - 40, y: startY}, {x: cx - 15, y: startY}]} key="w-in" />);
  
  // Top Adder (Input Sum)
  els.push(<Adder x={cx} y={startY} key="add-top" />);
  
  // Center Delay Spine
  for (let i = 0; i < N; i++) {
    const yTop = startY + i * rowSpacing;
    const yBot = startY + (i + 1) * rowSpacing;
    
    // Wire Down
    els.push(<Wire points={[{x: cx, y: yTop + 15}, {x: cx, y: yBot}]} markerEnd={true} key={`w-d-${i}`} />);
    // Delay component
    els.push(<Delay x={cx} y={yTop + rowSpacing/2} key={`d-${i}`} />);
  }
  
  const fbBusX = cx - sideWidth;
  if (N > 0) {
      // Wire from Feedback Bus to Top Adder
      els.push(<Wire points={[{x: fbBusX, y: startY}, {x: cx - 15, y: startY}]} markerEnd={true} key="w-fb-main" />);
  }

  // FEEDFORWARD (Right Side)
  const ffBusX = cx + sideWidth;
  
  // Output line
  els.push(<Wire points={[{x: ffBusX, y: startY}, {x: ffBusX + 60, y: startY}]} markerEnd={true} key="w-out-final" />);
  
  // b0 handling (direct from top)
  if (b[0] !== 0) {
      els.push(<Wire points={[{x: cx + 15, y: startY}, {x: ffBusX - 15, y: startY}]} markerEnd={true} key="w-b0" />);
      els.push(<Gain x={cx + sideWidth/2} y={startY} val={`b0`} direction="right" key="g-b0" />);
      els.push(<Adder x={ffBusX} y={startY} key="add-out-0" />);
  }

  for (let i = 1; i <= N; i++) {
    const y = startY + i * rowSpacing;
    const isLast = i === N;
    
    // Tap point at center
    els.push(<Junction x={cx} y={y} key={`j-${i}`} />);
    
    // --- Feedback Branch (Left) ---
    if (i < a.length && Math.abs(a[i]) > 0.001) {
       // Wire Left
       els.push(<Wire points={[{x: cx, y: y}, {x: fbBusX, y: y}]} markerEnd={false} key={`w-fb-out-${i}`} />);
       // Gain
       els.push(<Gain x={cx - sideWidth/2} y={y} val={`-a${i}`} direction="left" key={`g-a-${i}`} />);
       // Wire Up to join bus
       const prevY = startY + (i-1)*rowSpacing; 
       
       els.push(<Wire points={[{x: fbBusX, y: y}, {x: fbBusX, y: prevY}]} markerEnd={false} key={`w-fb-up-${i}`} />);
       els.push(<Junction x={fbBusX} y={y} key={`j-fb-${i}`} />);
    }

    // --- Feedforward Branch (Right) ---
    if (i < b.length && Math.abs(b[i]) > 0.001) {
       // Wire Right
       els.push(<Wire points={[{x: cx, y: y}, {x: ffBusX - 15, y: y}]} markerEnd={true} key={`w-ff-out-${i}`} />);
       // Gain
       els.push(<Gain x={cx + sideWidth/2} y={y} val={`b${i}`} direction="right" key={`g-b-${i}`} />);
       
       // Adder on the right spine
       els.push(<Adder x={ffBusX} y={y} key={`add-ff-${i}`} />);
       
       // Wire UP from this adder to the one above
       const prevY = startY + (i-1)*rowSpacing; 
       els.push(<Wire points={[{x: ffBusX, y: y - 15}, {x: ffBusX, y: prevY + (prevY === startY ? 15 : 15)}]} markerEnd={true} key={`w-ff-up-${i}`} />);
    }
  }

  return <g>{els}</g>;
};

const CascadeForm = ({ b, a }) => {
  const cx = SVG_WIDTH / 2;
  const cy = SVG_HEIGHT / 2;
  
  return (
    <g>
      <Text x={cx} y={150} className="text-xl font-bold fill-slate-800">Cascade (Series) Realization</Text>
      <Text x={cx} y={180} className="text-sm fill-slate-500">H(z) = H₁(z) · H₂(z) · ... · Hₖ(z)</Text>
      
      <g transform="translate(0, 50)">
        <Text x={100} y={cy} className="text-sm font-bold">x(n)</Text>
        <Wire points={[{x: 120, y: cy}, {x: 200, y: cy}]} />
        
        {/* Block 1 */}
        <rect x={200} y={cy - 40} width={120} height={80} fill="white" stroke={THEME.stroke} strokeWidth="2" rx="4"/>
        <Text x={260} y={cy} className="text-lg font-bold">H₁(z)</Text>
        
        <Wire points={[{x: 320, y: cy}, {x: 400, y: cy}]} />
        
        {/* Block 2 */}
        <rect x={400} y={cy - 40} width={120} height={80} fill="white" stroke={THEME.stroke} strokeWidth="2" rx="4"/>
        <Text x={460} y={cy} className="text-lg font-bold">H₂(z)</Text>
        
        <Wire points={[{x: 520, y: cy}, {x: 580, y: cy}]} />
        
        <circle cx={600} cy={cy} r={2} fill="black" />
        <circle cx={610} cy={cy} r={2} fill="black" />
        <circle cx={620} cy={cy} r={2} fill="black" />
        
        <Wire points={[{x: 640, y: cy}, {x: 700, y: cy}]} />
         
        {/* Block K */}
        <rect x={700} y={cy - 40} width={120} height={80} fill="white" stroke={THEME.stroke} strokeWidth="2" rx="4"/>
        <Text x={760} y={cy} className="text-lg font-bold">Hₖ(z)</Text>
        
        <Wire points={[{x: 820, y: cy}, {x: 880, y: cy}]} />
        <Text x={900} y={cy} className="text-sm font-bold">y(n)</Text>
      </g>
    </g>
  );
};

const LadderStructure = ({ b, a }) => {
  const stages = Math.min(5, Math.max(a.length, b.length) - 1); 
  const startX = 100;
  const startY = 200;
  const spacing = 140;
  const els = [];

  let currX = startX;
  
  els.push(<Text x={startX - 30} y={startY} key="ladder-in" className="text-sm font-bold">x(n)</Text>);

  for(let i=0; i<stages; i++) {
     // Top line (Right)
     els.push(<Wire points={[{x: currX, y: startY}, {x: currX+spacing, y: startY}]} markerEnd={true} key={`top-${i}`} />);
     // Bottom line (Left)
     els.push(<Wire points={[{x: currX+spacing, y: startY + 120}, {x: currX, y: startY + 120}]} markerEnd={true} key={`bot-${i}`} />);
     
     // Crosses
     // Down
     els.push(<Wire points={[{x: currX + 30, y: startY}, {x: currX + spacing - 30, y: startY + 120}]} markerEnd={true} key={`cross-down-${i}`} />);
     // Up
     els.push(<Wire points={[{x: currX + spacing - 30, y: startY + 120}, {x: currX + 30, y: startY}]} markerEnd={true} key={`cross-up-${i}`} />);
     
     // Coefficients
     els.push(<Gain x={currX + spacing/2} y={startY + 60} val={`k${stages-i}`} direction="down" key={`k-${i}`} />);
     
     // Delay in bottom line
     els.push(<Delay x={currX + spacing/2} y={startY + 120} key={`d-${i}`} />);
     
     // Adders
     els.push(<Adder x={currX + spacing} y={startY} key={`add-top-${i}`} />);
     els.push(<Adder x={currX} y={startY + 120} key={`add-bot-${i}`} />);

     currX += spacing;
  }
  
  els.push(<Text x={currX + 30} y={startY} key="ladder-out" className="text-sm font-bold">y(n)</Text>);

  return (
    <g>
       <Text x={SVG_WIDTH/2} y={50} className="text-xl font-bold fill-slate-800">Lattice-Ladder Structure</Text>
       <g transform="translate(50, 50)">{els}</g>
    </g>
  );
}

// --- API UTILS ---
const callGemini = async (prompt) => {
  const apiKey = ""; 
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
  
  const payload = {
    contents: [{ parts: [{ text: prompt }] }]
  };

  const attemptFetch = async (retries = 3, delay = 1000) => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
    } catch (err) {
      if (retries > 0) {
        await new Promise(r => setTimeout(r, delay));
        return attemptFetch(retries - 1, delay * 2);
      }
      throw err;
    }
  };

  return attemptFetch();
};


// --- MAIN APP COMPONENT ---

function App() {
  const [equation, setEquation] = useState("y(n) - 0.5y(n-1) = x(n) + 0.8x(n-1)");
  const [structure, setStructure] = useState("direct1");
  const [coeffs, setCoeffs] = useState({ a: [], b: [], error: null });

  // AI State
  const [aiMode, setAiMode] = useState('explain'); // 'explain' or 'generate'
  const [aiInput, setAiInput] = useState("");
  const [aiResult, setAiResult] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  useEffect(() => {
    const result = parseEquation(equation);
    setCoeffs(result);
    // Clear AI result when equation changes manually to avoid stale explanations
    if (aiMode === 'explain') setAiResult(null); 
  }, [equation]);

  const handleAiExplain = async () => {
    setIsAiLoading(true);
    setAiResult(null);
    try {
      const prompt = `You are a Digital Signal Processing expert. Analyze this difference equation: "${equation}". 
      1. Identify if it is IIR or FIR.
      2. Estimate its stability (poles inside unit circle?).
      3. Describe its likely behavior (Lowpass, Highpass, Integrator, Resonator, etc).
      4. Suggest a real-world application.
      Keep it concise (max 150 words), educational, and friendly.`;
      
      const text = await callGemini(prompt);
      setAiResult(text);
    } catch (e) {
      setAiResult("Error connecting to AI assistant. Please try again.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleAiGenerate = async () => {
    if (!aiInput.trim()) return;
    setIsAiLoading(true);
    setAiResult(null);
    try {
      const prompt = `Task: Convert the following natural language description into a discrete-time difference equation.
      Description: "${aiInput}"
      Rules:
      1. Output ONLY the difference equation string (e.g., "y(n) - 0.5y(n-1) = x(n)").
      2. Use 'y' for output and 'x' for input.
      3. Do NOT include LaTeX formatting, markdown, or explanations.
      4. Ensure the equation is valid and realizable.
      `;
      
      const text = await callGemini(prompt);
      const cleaned = text.trim().replace(/`/g, '').replace(/Difference equation:/i, '').trim();
      
      // Basic validation: check for equals sign
      if (cleaned.includes('=')) {
        setEquation(cleaned);
        setAiResult(`✨ Generated: ${cleaned}`);
      } else {
        setAiResult("Could not generate a valid equation. Please be more specific.");
      }
    } catch (e) {
      setAiResult("Error generating filter. Please try again.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const renderDiagram = () => {
    if (coeffs.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-red-500">
          <AlertTriangle size={48} className="mb-4" />
          <p>{coeffs.error}</p>
          <p className="text-sm text-gray-500 mt-2">Try: y(n) - 0.5y(n-1) = x(n)</p>
        </div>
      );
    }

    switch(structure) {
      case "direct1": return <DirectFormI a={coeffs.a} b={coeffs.b} />;
      case "direct2": return <DirectFormII a={coeffs.a} b={coeffs.b} />;
      case "cascade": return <CascadeForm a={coeffs.a} b={coeffs.b} />;
      case "parallel": return <CascadeForm a={coeffs.a} b={coeffs.b} />; 
      case "ladder": return <LadderStructure a={coeffs.a} b={coeffs.b} />;
      default: return null;
    }
  };

  const getTransferFunctionStr = () => {
    if (coeffs.error) return "Invalid Equation";
    
    const fmt = (arr, v) => arr.map((c, i) => {
       if (Math.abs(c) < 0.001) return null;
       const sign = c >= 0 ? (i===0 ? '' : '+') : '-';
       const val = Math.abs(c).toFixed(2);
       const z = i === 0 ? '' : `z^{-${i}}`;
       return `${sign} ${val}${z}`;
    }).filter(x => x).join(' ');

    const num = fmt(coeffs.b, 'z');
    const den = fmt(coeffs.a, 'z');
    
    return `H(z) = (${num}) / (${den})`;
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 font-sans">
      <style>{styles}</style>
      {/* Header */}
      <header className="bg-white border-b border-slate-200 p-4 flex items-center justify-between shadow-sm z-20 relative">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-2 rounded-lg text-white shadow-blue-200 shadow-md">
            <Settings size={20} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">IIR Filter Architect</h1>
        </div>
        <div className="flex gap-4 text-sm text-slate-500 font-medium">
          <span className="flex items-center gap-1"><Info size={16}/> Discrete Time Systems</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-1 overflow-hidden">
        
        {/* Sidebar Controls */}
        <aside className="w-96 bg-white border-r border-slate-200 flex flex-col z-10 shadow-xl overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
            
            {/* Equation Input */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Difference Equation</label>
              <div className="relative">
                <textarea 
                  className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition font-mono text-sm shadow-sm resize-none bg-slate-50"
                  rows={3}
                  value={equation}
                  onChange={(e) => setEquation(e.target.value)}
                  placeholder="y(n) - 0.5y(n-1) = x(n)"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-2 flex items-center gap-1">
                <Info size={10}/> Format: y(n) terms on left, x(n) on right.
              </p>
            </div>

            {/* Structure Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Topology</label>
              <div className="grid grid-cols-1 gap-2">
                {[
                  {id: 'direct1', label: 'Direct Form I'},
                  {id: 'direct2', label: 'Direct Form II (Canonical)'},
                  {id: 'cascade', label: 'Cascade Form'},
                  {id: 'parallel', label: 'Parallel Form'},
                  {id: 'ladder', label: 'Ladder / Lattice'}
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setStructure(opt.id)}
                    className={`px-4 py-3 rounded-lg text-left text-sm transition font-medium border flex items-center justify-between group ${
                      structure === opt.id 
                        ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm' 
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    {opt.label}
                    {structure === opt.id && <div className="w-2 h-2 rounded-full bg-blue-500"/>}
                  </button>
                ))}
              </div>
            </div>

            {/* Transfer Function Display */}
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Transfer Function H(z)</h3>
              <p className="font-mono text-xs text-blue-700 break-words leading-relaxed font-medium">
                {getTransferFunctionStr()}
              </p>
            </div>

            {/* AI Assistant Section */}
            <div className="border border-indigo-100 rounded-xl overflow-hidden shadow-sm bg-gradient-to-b from-indigo-50/50 to-white mt-auto">
              <div className="p-3 bg-indigo-50/80 border-b border-indigo-100 flex items-center justify-between backdrop-blur-sm">
                 <div className="flex items-center gap-2 text-indigo-900 font-bold text-xs uppercase tracking-wide">
                   <Sparkles size={14} className="text-indigo-600" />
                   AI DSP Assistant
                 </div>
              </div>
              
              <div className="p-4 flex flex-col gap-4">
                {/* Tabs */}
                <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
                  <button 
                    onClick={() => { setAiMode('explain'); setAiResult(null); }}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${aiMode === 'explain' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Explain
                  </button>
                  <button 
                    onClick={() => { setAiMode('generate'); setAiResult(null); }}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${aiMode === 'generate' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Generate
                  </button>
                </div>

                {aiMode === 'explain' ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Get an expert analysis of your current filter's stability and application.
                    </p>
                    <button 
                      onClick={handleAiExplain}
                      disabled={isAiLoading || coeffs.error}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-md shadow-indigo-200"
                    >
                      {isAiLoading ? <Loader2 size={16} className="animate-spin"/> : <Sparkles size={16}/>}
                      Analyze Filter
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Describe a filter in plain English and I'll write the equation.
                    </p>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={aiInput}
                        onChange={(e) => setAiInput(e.target.value)}
                        placeholder="e.g. Simple low pass filter"
                        className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-500 bg-white"
                        onKeyDown={(e) => e.key === 'Enter' && handleAiGenerate()}
                      />
                      <button 
                        onClick={handleAiGenerate}
                        disabled={isAiLoading || !aiInput.trim()}
                        className="px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center justify-center disabled:opacity-50 shadow-md shadow-indigo-200"
                      >
                        {isAiLoading ? <Loader2 size={16} className="animate-spin"/> : <ArrowRight size={16}/>}
                      </button>
                    </div>
                  </div>
                )}

                {/* AI Result Area */}
                {aiResult && (
                  <div className="mt-2 p-3 bg-white rounded-lg border border-indigo-100 text-xs text-slate-700 leading-relaxed animate-in fade-in slide-in-from-top-2 shadow-sm">
                    <div className="font-bold text-indigo-900 mb-1 flex items-center gap-1.5">
                      <MessageSquare size={12}/> Gemini Response
                    </div>
                    {aiResult}
                  </div>
                )}
              </div>
            </div>

          </div>
        </aside>

        {/* Visualization Area */}
        <section className="flex-1 bg-slate-50 relative overflow-hidden flex flex-col">
          
          <div className="absolute top-6 left-6 z-0 opacity-10">
             <h2 className="text-6xl font-black text-slate-900 pointer-events-none tracking-tighter">
               {structure.toUpperCase().replace('DIRECT', 'DF').replace('1','-I').replace('2','-II')}
             </h2>
          </div>

          <div className="flex-1 overflow-auto p-8 flex items-center justify-center bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:20px_20px]">
            <div className="bg-white shadow-2xl shadow-slate-200 rounded-xl border border-slate-100 p-8 min-w-[800px] min-h-[600px] flex items-center justify-center relative">
               <div className="absolute top-4 left-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Block Diagram Realization
               </div>
              <svg width={SVG_WIDTH} height={SVG_HEIGHT} viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}>
                <defs>
                  <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#334155" />
                  </marker>
                </defs>
                {renderDiagram()}
              </svg>
            </div>
          </div>
          
          {/* Footer Info */}
          <div className="bg-white border-t border-slate-200 p-3 text-[10px] text-center text-slate-400 font-medium uppercase tracking-wider">
             Engineered with React + SVG • Standard Signal Flow Graph Notation
          </div>
        </section>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
