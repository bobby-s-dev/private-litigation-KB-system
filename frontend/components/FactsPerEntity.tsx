'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'

const data = [
  { name: 'Mulder Scully', value: 35, color: '#8b5cf6' },
  { name: 'Texoma General Hospital', value: 20, color: '#e5e7eb' },
  { name: 'Lane Parish', value: 18, color: '#1e40af' },
  { name: 'Avery Jackson', value: 12, color: '#a78bfa' },
  { name: 'Alex Karen', value: 8, color: '#3b82f6' },
  { name: 'Dr. Robbins', value: 4, color: '#60a5fa' },
  { name: 'Bicalutamide', value: 2, color: '#93c5fd' },
  { name: 'Paperless Records System', value: 1, color: '#cbd5e1' },
  { name: 'Improved', value: 1, color: '#d1d5db' },
]

export default function FactsPerEntity() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Facts per Entity</h2>
        <button className="text-sm text-purple-600 hover:text-purple-700 font-medium">
          View all
        </button>
      </div>
      <div className="flex items-center justify-center">
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip />
            <Legend
              verticalAlign="top"
              height={36}
              iconType="circle"
              wrapperStyle={{ fontSize: '12px' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4">
        {data.map((item, index) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: item.color }}
            ></div>
            <span className="text-gray-700">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

