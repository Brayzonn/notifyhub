import { CustomerPlan } from '@prisma/client';

export const PLAN_LIMITS = {
  [CustomerPlan.FREE]: {
    monthlyLimit: 200,
    rateLimit: 10,
    logRetentionDays: 30,
    name: 'Free',
    price: 0,
    features: [
      '200 notifications/month',
      '30-day log retention',
      'Email delivery',
      'Webhook support',
      'Basic monitoring',
      'Community support',
    ],
  },
  [CustomerPlan.INDIE]: {
    monthlyLimit: 3000,
    rateLimit: 100,
    logRetentionDays: 90,
    name: 'Indie',
    price: 9,
    features: [
      '3,000 notifications/month',
      '90-day log retention',
      'All Free features',
      'Priority support',
      'Advanced monitoring',
      'Custom email templates',
      'Domain verification',
    ],
  },
  [CustomerPlan.STARTUP]: {
    monthlyLimit: 15000,
    rateLimit: 500,
    logRetentionDays: null,
    name: 'Startup',
    price: 39,
    features: [
      '15,000 notifications/month',
      'Unlimited log retention',
      'All Indie features',
      'Dedicated support',
      'Advanced analytics',
      'Higher rate limits',
      'Scheduled notifications',
    ],
  },
} as const;

export const getPlanLimit = (plan: CustomerPlan): number => {
  return PLAN_LIMITS[plan].monthlyLimit;
};

export const getLogRetentionPeriod = (plan: CustomerPlan): number | null => {
  return PLAN_LIMITS[plan].logRetentionDays;
};

export const getPlanRateLimit = (plan: CustomerPlan): number => {
  return PLAN_LIMITS[plan].rateLimit;
};

export const getPlanDetails = (plan: CustomerPlan) => {
  return PLAN_LIMITS[plan];
};
