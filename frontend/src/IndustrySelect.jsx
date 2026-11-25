import { useState } from 'react';
import { INDUSTRIES, INDUSTRY_GROUPS } from './lib.jsx';
import { Input, Select } from './ui.jsx';

// The Industry box: a drop-down list. Choosing "Others" opens a box below it where the company
// can type its own industry; left empty, the industry is simply "Others".
// value is the industry as text; onChange is given the new text.
export default function IndustrySelect({ value, onChange, error }) {
  // An industry that is not in the list (typed earlier, or uploaded from Excel) is shown as "Others" with its text.
  const [typing, setTyping] = useState(() => value === 'Others' || (Boolean(value) && !INDUSTRIES.includes(value)));
  const typed = typing && value !== 'Others' ? value : '';

  function pick(e) {
    const chosen = e.target.value;
    setTyping(chosen === 'Others');
    onChange(chosen);
  }

  return (
    <>
      <Select value={typing ? 'Others' : value} onChange={pick} error={error}>
        <option value="">Select</option>
        {INDUSTRY_GROUPS.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.items.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </optgroup>
        ))}
        <option>Others</option>
      </Select>
      {typing && (
        <Input
          value={typed}
          onChange={(e) => onChange(e.target.value.trim() ? e.target.value : 'Others')}
          placeholder="Type your industry"
          aria-label="Your industry"
          maxLength={60}
          className="mt-2"
        />
      )}
    </>
  );
}
