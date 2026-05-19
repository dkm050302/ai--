console.log('🚀 Starting application...');

async function main() {
  console.log('✅ Main function started');

  // 测试基本功能
  console.log('✅ Node.js is working');
  console.log('✅ Environment:', process.env.NODE_ENV || 'development');
  console.log('✅ Port:', process.env.PORT || '3000');

  console.log('✅ Application started successfully');
  console.log('📍 Server would be running on port', process.env.PORT || 3000);
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
