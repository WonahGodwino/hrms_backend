// src/app/lib/openaiUsage.ts
interface UsageRecord {
  timestamp: Date
  tokens: number
  cost: number
  endpoint: string
  model: string
  companyId?: string
  userId?: string
  applicationId?: string
}

class OpenAIUsageTracker {
  private usage: UsageRecord[] = []
  
  recordUsage(
    tokens: number, 
    model: string, 
    endpoint: string,
    companyId?: string,
    userId?: string,
    applicationId?: string
  ): number {
    const cost = this.calculateCost(tokens, model)
    const record: UsageRecord = {
      timestamp: new Date(),
      tokens,
      cost,
      endpoint,
      model,
      companyId,
      userId,
      applicationId
    }
    
    this.usage.push(record)
    
    // Keep only last 10000 records
    if (this.usage.length > 10000) {
      this.usage = this.usage.slice(-10000)
    }
    
    return cost
  }
  
  private calculateCost(tokens: number, model: string): number {
    const rates: Record<string, number> = {
      'gpt-4-turbo-preview': 0.01,
      'gpt-4': 0.03,
      'gpt-3.5-turbo': 0.001,
      'gpt-3.5-turbo-16k': 0.003,
      'claude-3-opus': 0.015,
      'claude-3-sonnet': 0.003,
      'claude-3-haiku': 0.00025,
      'gemini-pro': 0.0015
    }
    
    const rate = rates[model] || rates['gpt-3.5-turbo']
    return (tokens / 1000) * rate
  }
  
  getDailyUsage(companyId?: string): number {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const todayUsage = this.usage.filter(record => {
      const timeMatch = record.timestamp > oneDayAgo
      const companyMatch = !companyId || record.companyId === companyId
      return timeMatch && companyMatch
    })
    
    return todayUsage.reduce((sum, record) => sum + record.cost, 0)
  }
  
  getUsageStats(companyId?: string) {
    const dailyCost = this.getDailyUsage(companyId)
    const monthlyCost = dailyCost * 30
    
    const filteredUsage = companyId 
      ? this.usage.filter(record => record.companyId === companyId)
      : this.usage
    
    const totalCost = filteredUsage.reduce((sum, record) => sum + record.cost, 0)
    const totalTokens = filteredUsage.reduce((sum, record) => sum + record.tokens, 0)
    
    return {
      totalRecords: filteredUsage.length,
      dailyCost: dailyCost.toFixed(4),
      monthlyEstimate: monthlyCost.toFixed(2),
      totalCost: totalCost.toFixed(2),
      totalTokens,
      companyFilter: companyId || 'all'
    }
  }
  
  getRecentUsage(limit: number = 20, companyId?: string): UsageRecord[] {
    let filtered = this.usage
    
    if (companyId) {
      filtered = filtered.filter(record => record.companyId === companyId)
    }
    
    return filtered.slice(-limit).reverse()
  }
  
  getCompanyBreakdown() {
    const breakdown: Record<string, { 
      count: number; 
      totalCost: number; 
      totalTokens: number 
    }> = {}
    
    this.usage.forEach(record => {
      const company = record.companyId || 'unknown'
      if (!breakdown[company]) {
        breakdown[company] = { count: 0, totalCost: 0, totalTokens: 0 }
      }
      breakdown[company].count++
      breakdown[company].totalCost += record.cost
      breakdown[company].totalTokens += record.tokens
    })
    
    return breakdown
  }
  
  clearOldRecords(daysToKeep: number = 30) {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000)
    this.usage = this.usage.filter(record => record.timestamp > cutoffDate)
  }
}

export const openaiUsageTracker = new OpenAIUsageTracker()