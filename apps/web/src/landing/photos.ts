// Event photos for the landing: CC0 pictures from StockSnap (authors and sources in
// ./photos/CREDITS.md). Static imports, so next/image knows their size (no layout shift), makes a
// blur placeholder and serves AVIF/WebP at the sizes a slot needs.
import birthdayBalloons from './photos/birthday-balloons.jpg';
import birthdayCake from './photos/birthday-cake.jpg';
import birthdayCandles from './photos/birthday-candles.jpg';
import corporateCheer from './photos/corporate-cheer.jpg';
import corporateTeam from './photos/corporate-team.jpg';
import familyHug from './photos/family-hug.jpg';
import familyKitchen from './photos/family-kitchen.jpg';
import familyPark from './photos/family-park.jpg';
import familyPicnic from './photos/family-picnic.jpg';
import partyToast from './photos/party-toast.jpg';
import tripHill from './photos/trip-hill.jpg';
import tripSelfie from './photos/trip-selfie.jpg';
import weddingBouquet from './photos/wedding-bouquet.jpg';
import weddingStairs from './photos/wedding-stairs.jpg';
import weddingTable from './photos/wedding-table.jpg';

/**
 * next/image quality for the photos: their sources are only 960px wide (StockSnap's public size),
 * so they are encoded at 90 rather than the default 75 to add no softness of their own.
 */
export const PHOTO_QUALITY = 90;

/**
 * The hero's collection: one family celebration, the same demo collection whose guest page the
 * phone beside it shows («Ювілей Ніни Петрівни», «Класика»), so phone and grid read as one story.
 */
export const HERO_FRAMES = [
  familyPark,
  birthdayCake,
  familyHug,
  familyKitchen,
  weddingTable,
  birthdayCandles,
  familyPicnic,
  birthdayBalloons,
] as const;

export const CASE_PHOTOS = {
  wedding: weddingStairs,
  birthday: birthdayCandles,
  family: familyPicnic,
  trip: tripHill,
  corporate: corporateCheer,
} as const;

/** The closing block's collection: one of each kind of event, as the page has told them. */
export const CLOSING_FRAMES = [
  weddingBouquet,
  tripSelfie,
  birthdayBalloons,
  familyPark,
  partyToast,
  corporateTeam,
] as const;
