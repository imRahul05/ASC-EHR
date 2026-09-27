import type { Metadata } from "next";
import { ReferralInbox } from "@/features/referrals/referral-inbox";

export const metadata: Metadata = { title: "Referrals" };

export default function ReferralsPage() {
  return <ReferralInbox />;
}
