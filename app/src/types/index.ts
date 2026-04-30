export type Client = {
  id: string;
  pseudonym: string;
  email?: string;
  loginCode: string;
};

export type Restaurant = {
  id: string;
  name: string;
  ownerName?: string;
  address: string;
  lat: number;
  lng: number;
  imageUrl: string;
  phoneFixed?: string;
  phoneMobile?: string;
  loginCode: string;
  rewardThreshold: number;
  rewardType: 'free_meal' | 'discount';
  rewardValue?: number;
};

export type LoyaltyEntry = {
  clientId: string;
  restaurantId: string;
  pseudonym: string;
  points: number;
};

export type SignupRequest = {
  id: string;
  ownerName: string;
  companyName: string;
  address: string;
  lat?: number;
  lng?: number;
  phoneFixed?: string;
  phoneMobile?: string;
  email: string;
  imageUrl?: string;
  createdAt: number;
  status: 'pending' | 'approved';
};

export type RewardType = Restaurant['rewardType'];
