'use client'

import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { apiClient } from '@/lib/api'
import CustomTooltip from '@/components/Tooltip'

interface FactsPerEntityProps {
  matterId?: string | null
}

interface EntityData {
  name: string
  value: number
  color: string
  type: string
}

export default function FactsPerEntity({ matterId }: FactsPerEntityProps) {
  const [data, setData] = useState<EntityData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      if (!matterId) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const factsPerEntity = await apiClient.getFactsPerEntity(matterId)
        setData(factsPerEntity)
      } catch (error) {
        console.error('Error loading facts per entity:', error)
        setData([])
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [matterId])

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Facts per Entity</h2>
        </div>
        <div className="flex items-center justify-center h-[300px]">
          <div className="text-gray-500">Loading...</div>
        </div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Facts per Entity</h2>
        </div>
        <div className="flex items-center justify-center h-[300px]">
          <div className="text-center text-gray-500">
            <p>No facts found yet.</p>
            <p className="text-sm mt-2">Upload and process documents to see facts per entity.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Facts per Entity</h2>
        <button className="text-sm text-primary-600 hover:text-primary-700 font-medium">
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
            <CustomTooltip content={item.name}>
              <span className="text-gray-700 truncate">
                {item.name}
              </span>
            </CustomTooltip>
          </div>
        ))}
      </div>
    </div>
  )
}

