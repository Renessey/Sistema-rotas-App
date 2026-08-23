const { RouteOptimizationService } = require('../src/services/routing/RouteOptimizationService');

// Simulate 113 stops:
// Stop 0: [ -42.8180, -22.9190 ] (Condo Costa do Sol 2 - House 4) -> (was stop 01)
// Stop 47: [ -42.8182, -22.9193 ] (Condo Costa do Sol 2 - House 2) -> (was stop 48, right next to stop 01!)
// Stop 49: [ -42.8170, -22.9185 ] (Avenida) -> (was stop 50)
// Stop 1: [ -42.8160, -22.9170 ] (Rua Tietê) -> (was stop 02)
// Plus 109 other random stops spread across Maricá/Inoã
const start = [-42.8188, -22.9192];
const stops = [];

// Add the condo stops and neighbors
stops.push([-42.8180, -22.9190]); // 0 (Condo A)
stops.push([-42.8160, -22.9170]); // 1 (Rua Tietê)
for (let i = 2; i < 47; i++) {
  // Far away stops across town
  stops.push([-42.8000 + (i * 0.001), -22.9000 - (i * 0.001)]);
}
stops.push([-42.8182, -22.9193]); // 47 (Condo B - next door to 0!)
stops.push([-42.8000, -22.9000]); // 48
stops.push([-42.8170, -22.9185]); // 49 (Avenida nearby)
for (let i = 50; i < 113; i++) {
  stops.push([-42.7800 + (i * 0.0008), -22.8800 - (i * 0.0008)]);
}

console.log('Total stops created:', stops.length);

RouteOptimizationService.optimize(start, stops, { useDuration: true }).then((res) => {
  console.log('Optimization finished successfully!');
  const pos0 = res.order.indexOf(0);
  const pos47 = res.order.indexOf(47);
  const pos49 = res.order.indexOf(49);
  const pos1 = res.order.indexOf(1);

  console.log(`Stop 0 (Condo A) is at sequence: ${pos0 + 1}`);
  console.log(`Stop 47 (Condo B - same street) is at sequence: ${pos47 + 1}`);
  console.log(`Stop 49 (Avenida nearby) is at sequence: ${pos49 + 1}`);
  console.log(`Stop 1 (Rua Tietê) is at sequence: ${pos1 + 1}`);
  console.log('First 5 stops in order:', res.order.slice(0, 5));
});
