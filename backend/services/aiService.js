const axios = require('axios');
const logger = require('../utils/logger');

class AIService {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    this.baseURL = 'https://api.openai.com/v1';
  }

  async generateActivitySummary(activity) {
    try {
      const prompt = `Generate a concise, engaging one-line summary for this activity:
Title: ${activity.title}
URL: ${activity.url || 'N/A'}
Description: ${activity.description || 'N/A'}
Time spent: ${activity.time_spent} seconds

Make it human-friendly and capture the essence of what they were doing. Keep it under 100 characters.`;

      const response = await axios.post(`${this.baseURL}/chat/completions`, {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 50,
        temperature: 0.7
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data.choices[0].message.content.trim();
    } catch (error) {
      logger.error('Error generating activity summary:', error);
      return `${activity.title} - ${Math.round(activity.time_spent / 60)} minutes`;
    }
  }

  async determineMoodAndProductivity(activity) {
    try {
      const prompt = `Based on this activity, determine the mood and productivity level:
Title: ${activity.title}
URL: ${activity.url || 'N/A'}
Description: ${activity.description || 'N/A'}
Time spent: ${activity.time_spent} seconds

Respond with JSON format:
{
  "mood": "happy|productive|distracted|calm|stressed",
  "productivity_score": 1-100
}

Consider: social media = distracted, coding/work = productive, entertainment = happy, learning = productive`;

      const response = await axios.post(`${this.baseURL}/chat/completions`, {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
        temperature: 0.3
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const result = JSON.parse(response.data.choices[0].message.content.trim());
      return {
        mood: result.mood || 'calm',
        productivity_score: Math.min(100, Math.max(1, result.productivity_score || 50))
      };
    } catch (error) {
      logger.error('Error determining mood and productivity:', error);
      return { mood: 'calm', productivity_score: 50 };
    }
  }

  async generateDailyInsights(activities) {
    try {
      const totalTime = activities.reduce((sum, act) => sum + act.time_spent, 0);
      const productiveActivities = activities.filter(act => act.productivity_score > 60);
      const topSites = this.getTopSites(activities);

      const prompt = `Generate daily insights and suggestions based on these activities:
Total activities: ${activities.length}
Total time: ${Math.round(totalTime / 3600)} hours
Productive activities: ${productiveActivities.length}
Top sites: ${topSites.join(', ')}

Average productivity: ${this.calculateAverageProductivity(activities)}%

Provide insights in JSON format:
{
  "key_insights": ["insight1", "insight2", "insight3"],
  "suggestions": ["suggestion1", "suggestion2"],
  "productivity_summary": "one line summary",
  "focus_time": "${Math.round(productiveActivities.reduce((sum, act) => sum + act.time_spent, 0) / 3600)}h"
}`;

      const response = await axios.post(`${this.baseURL}/chat/completions`, {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.6
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return JSON.parse(response.data.choices[0].message.content.trim());
    } catch (error) {
      logger.error('Error generating daily insights:', error);
      return {
        key_insights: ['You were active today', 'Mix of productive and leisure time'],
        suggestions: ['Try blocking time for deep work', 'Take regular breaks'],
        productivity_summary: 'A balanced day with room for improvement',
        focus_time: '2h'
      };
    }
  }

  async generateWeeklyReport(weeklyData) {
    try {
      const prompt = `Generate a weekly productivity report based on this data:
${JSON.stringify(weeklyData, null, 2)}

Provide a comprehensive weekly analysis in JSON format:
{
  "average_focus_time": "Xh Ym",
  "peak_performance_hours": ["hour1", "hour2"],
  "productivity_trends": "trend description",
  "recurring_patterns": ["pattern1", "pattern2"],
  "weekly_insights": ["insight1", "insight2", "insight3"],
  "recommendations": ["rec1", "rec2"]
}`;

      const response = await axios.post(`${this.baseURL}/chat/completions`, {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 400,
        temperature: 0.6
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return JSON.parse(response.data.choices[0].message.content.trim());
    } catch (error) {
      logger.error('Error generating weekly report:', error);
      return {
        average_focus_time: '3h 30m',
        peak_performance_hours: ['10AM', '3PM'],
        productivity_trends: 'Steady improvement throughout the week',
        recurring_patterns: ['Strong morning starts', 'Post-lunch productivity dip'],
        weekly_insights: ['You maintain good focus in mornings', 'Afternoon energy could be optimized'],
        recommendations: ['Schedule important tasks before noon', 'Take a short walk after lunch']
      };
    }
  }

  async selectTopHighlights(activities, timeframe = 'daily') {
    try {
      const sortedActivities = activities
        .sort((a, b) => (b.productivity_score || 0) - (a.productivity_score || 0))
        .slice(0, timeframe === 'daily' ? 5 : 10);

      const highlights = sortedActivities.map(activity => ({
        ...activity,
        highlight_reason: this.getHighlightReason(activity)
      }));

      return highlights;
    } catch (error) {
      logger.error('Error selecting top highlights:', error);
      return activities.slice(0, 5);
    }
  }

  async contextualSearch(activities, query) {
    try {
      const relevantActivities = activities.filter(activity => {
        const searchText = `${activity.title} ${activity.description || ''} ${activity.ai_summary || ''}`.toLowerCase();
        return searchText.includes(query.toLowerCase());
      });

      if (relevantActivities.length === 0) {
        return [];
      }

      const prompt = `Find activities that match this contextual query: "${query}"
Activities: ${JSON.stringify(relevantActivities.map(a => ({
        title: a.title,
        description: a.description,
        summary: a.ai_summary,
        mood: a.mood
      })), null, 2)}

Return the most relevant activities that match the emotional or contextual intent of the query.`;

      const response = await axios.post(`${this.baseURL}/chat/completions`, {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.4
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return relevantActivities;
    } catch (error) {
      logger.error('Error in contextual search:', error);
      return activities.filter(a => 
        a.title.toLowerCase().includes(query.toLowerCase()) ||
        (a.description && a.description.toLowerCase().includes(query.toLowerCase()))
      );
    }
  }

  getTopSites(activities) {
    const siteMap = {};
    activities.forEach(activity => {
      if (activity.url) {
        const domain = new URL(activity.url).hostname;
        siteMap[domain] = (siteMap[domain] || 0) + activity.time_spent;
      }
    });
    return Object.entries(siteMap)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([domain]) => domain);
  }

  calculateAverageProductivity(activities) {
    if (activities.length === 0) return 0;
    const total = activities.reduce((sum, act) => sum + (act.productivity_score || 50), 0);
    return Math.round(total / activities.length);
  }

  getHighlightReason(activity) {
    if (activity.productivity_score > 80) return 'High productivity';
    if (activity.mood === 'happy') return 'Positive moment';
    if (activity.time_spent > 3600) return 'Long focus session';
    return 'Notable activity';
  }
}

module.exports = new AIService();
