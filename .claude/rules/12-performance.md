# Performance

Optimize based on measurements and obvious architecture hazards.

Avoid:
- loading large files through API memory;
- N+1 queries;
- unnecessary client JavaScript;
- duplicate network requests;
- giant global stores;
- rendering huge galleries without virtualization/pagination where needed.

Prefer pagination, caching and streaming where justified.

Do not prematurely optimize microseconds at the cost of complexity.
